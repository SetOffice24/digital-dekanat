/**
 * Регрессия по аудиту 21.11 (docs/audits/security-2026-11-21*.md): ожидания — безопасный результат.
 * Согласование по закрытой заявке, квота записи при параллельных запросах, отметки до начала приёма,
 * гонка ответа студента, дубли по черновику, баллы прошлого семестра, причина отсутствия у преподавателя,
 * повтор напоминания после сбоя. Требует засеянную БД; за собой убирает.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { decideApproval, submitRequest } from "@/server/services/requests";
import { AppointmentError, availability, bookAppointment, markAppointment } from "@/server/services/appointments";
import { answerRequest } from "@/server/repos/student";
import { claimDraft, markDraftDone, releaseDraft } from "@/server/repos/assistant";
import { addGrade, TeacherAccessError } from "@/server/repos/teacher";
import { absentStudents } from "@/server/services/teacher";

const db = new PrismaClient();
const load = (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true, staff: true } });
type U = Awaited<ReturnType<typeof load>>;
let anna: U, teacher: U, dekanat: U;
const made: string[] = [];
const chats: string[] = [];
const staffOf = (u: U) => ({ id: u.staff!.id, userId: u.id, facultyId: u.staff!.facultyId });

beforeAll(async () => {
  [anna, teacher, dekanat] = await Promise.all(["anna.lesnova", "teacher", "dekanat"].map(load));
});
afterAll(async () => {
  await db.request.deleteMany({ where: { id: { in: made } } });
  await db.appointment.deleteMany({ where: { purpose: { startsWith: "АУДИТ" } } });
  await db.reminder.deleteMany({ where: { text: { contains: "АУДИТ" } } });
  await db.aiChat.deleteMany({ where: { id: { in: chats } } });
  await db.$disconnect();
});

describe("согласование", () => {
  it("по завершённой заявке решение не принимается и ложного события нет", async () => {
    const r = await submitRequest(anna.student!, await db.requestType.findUniqueOrThrow({ where: { code: "APP_RECREDIT" } }), { course: "Алгоритмы и структуры данных", prior: "x", grade: "4" });
    made.push(r.id);
    await db.request.update({ where: { id: r.id }, data: { status: "DONE" } });
    const ap = await db.requestApproval.findFirstOrThrow({ where: { requestId: r.id } });
    const events = await db.requestEvent.count({ where: { requestId: r.id } });
    expect(await decideApproval({ teacherId: teacher.teacher!.id, userId: teacher.id }, ap.id, "REJECTED", "Поздно")).toBeNull();
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("DONE");
    expect((await db.requestApproval.findUniqueOrThrow({ where: { id: ap.id } })).status).toBe("PENDING");
    expect(await db.requestEvent.count({ where: { requestId: r.id } })).toBe(events);
  });
});

describe("запись на приём", () => {
  it("параллельные запросы на разные слоты не обходят квоту в две записи", async () => {
    const s = anna.student!;
    await db.appointment.updateMany({ where: { studentId: s.id, status: "BOOKED" }, data: { status: "CANCELLED", slotKey: null } });
    const free = (await availability(8)).flatMap((d) => d.slots.filter((x) => x.free)).slice(0, 4);
    const res = await Promise.allSettled(free.map((f, i) => bookAppointment(s, f.at.toISOString(), `АУДИТ параллельно ${i}`)));
    expect(res.filter((x) => x.status === "fulfilled").length).toBe(2);
    expect(res.filter((x) => x.status === "rejected").every((x) => (x as PromiseRejectedResult).reason instanceof AppointmentError)).toBe(true);
    expect(await db.appointment.count({ where: { studentId: s.id, status: "BOOKED", startsAt: { gt: new Date() } } })).toBe(2);
  });

  it("будущий приём нельзя отметить «не пришёл»; отмеченный слот остаётся занятым", async () => {
    const a = await db.appointment.findFirstOrThrow({ where: { studentId: anna.student!.id, status: "BOOKED", purpose: { startsWith: "АУДИТ" } } });
    expect(await markAppointment(staffOf(dekanat), a.id, "NO_SHOW")).toBe(false);
    expect(await markAppointment(staffOf(dekanat), a.id, "DONE")).toBe(a.startsAt.getTime() <= Date.now() + 15 * 60_000);
    // даже если статус изменён напрямую, слот с ключом считается занятым
    await db.appointment.update({ where: { id: a.id }, data: { status: "DONE" } });
    const slot = (await availability(8)).flatMap((d) => d.slots).find((x) => x.at.getTime() === a.startsAt.getTime());
    expect(slot?.free).toBe(false);
  });
});

describe("заявки и черновики", () => {
  it("ответ студента не возвращает в работу заявку, которую деканат уже отклонил", async () => {
    const r = await submitRequest(anna.student!, await db.requestType.findUniqueOrThrow({ where: { code: "APP_OTHER" } }), { subject: "АУДИТ", text: "Тест гонки" });
    made.push(r.id);
    await db.request.update({ where: { id: r.id }, data: { status: "REJECTED" } });
    expect(await answerRequest(anna.student!, r.id, "Мой ответ")).toBeNull();
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("REJECTED");
  });

  it("черновик захватывает только один из параллельных запросов; после выполнения повтор невозможен", async () => {
    const chat = await db.aiChat.create({ data: { userId: anna.id, title: "АУДИТ", messages: { create: { role: "ASSISTANT", content: "x", draft: { kind: "REMINDER" } } } }, include: { messages: true } });
    chats.push(chat.id);
    const id = chat.messages[0].id;
    const owner = { userId: anna.id };
    const got = await Promise.all(Array.from({ length: 5 }, () => claimDraft(owner, id, "reminderWhen")));
    expect(got.filter(Boolean).length).toBe(1);
    expect(await claimDraft({ userId: teacher.id }, id, "reminderWhen")).toBe(false); // чужой
    await releaseDraft(owner, id);
    expect(await claimDraft(owner, id, "reminderWhen")).toBe(true);
    await markDraftDone(owner, id, { reminderWhen: "завтра" });
    expect(await claimDraft(owner, id, "reminderWhen")).toBe(false);
    expect((await db.aiMessage.findUniqueOrThrow({ where: { id } })).draft).toEqual({ kind: "REMINDER", reminderWhen: "завтра" });
  });
});

describe("преподаватель", () => {
  it("баллы в зачисление прошлого семестра не ставятся", async () => {
    const past = await db.enrollment.findFirst({ where: { student: { groupId: anna.student!.groupId, course: { gt: 1 } }, semester: { lt: anna.student!.course * 2 - 1 } } });
    if (!past) return; // в сиде нет прошлых семестров у этой группы
    await expect(addGrade({ id: teacher.teacher!.id } as never, past.id, 5, "АУДИТ")).rejects.toBeInstanceOf(TeacherAccessError);
  });

  it("в списке отсутствующих нет текста причины из заявления", async () => {
    const list = await absentStudents(teacher.teacher!.id);
    const reasons = (await db.request.findMany({ where: { type: { code: "APP_ABSENCE" } }, select: { payload: true } })).map((r) => (r.payload as Record<string, string>).reason).filter(Boolean);
    for (const a of list) for (const r of reasons) expect(a.reason).not.toContain(r);
  });
});

describe("напоминания", () => {
  it("сбой уведомления не теряет напоминание — следующий тик доставит", async () => {
    const r = await db.reminder.create({ data: { userId: anna.id, text: "АУДИТ напоминание", dueAt: new Date(Date.now() - 1000) } });
    const notify = await import("@/server/notify");
    const spy = vi.spyOn(notify, "notify").mockRejectedValueOnce(new Error("сбой"));
    const { deliverDueReminders } = await import("@/server/reminders");
    await deliverDueReminders(anna.id);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).sentAt).toBeNull();
    spy.mockRestore();
    await deliverDueReminders(anna.id);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).sentAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: anna.id, dedupeKey: `reminder:${r.id}` } })).toBe(1);
  });
});
