/**
 * Сквозные сценарии между ролями (аудит docs/audits/user-flows-2026-11-21.md):
 * ДЗ — принять с баллами (оценка связана с работой, возврат её снимает), сигнал преподавателю о сдаче;
 * пересдача — назначение деканатом → видна только этому студенту → результат преподавателя закрывает долг;
 * перезачёт — после согласования деканат вносит оценку, «просто выполнить» нельзя;
 * замена отклонённого документа в открытой заявке; посторонний приём не закрывает шаг плана.
 * Требует засеянную БД; за собой убирает.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { reviewSubmission, submitHomework } from "@/server/repos/homework";
import { decideApproval, submitRequest } from "@/server/services/requests";
import { changeRequestStatus } from "@/server/repos/staff";
import { AcademicError, recordRecredit, recordRetakeResult, retakeOptions, scheduleRetake } from "@/server/services/academic";
import { getEnrollments, getExams, summarize } from "@/server/repos/student";
import { replaceRequestDocument, reviewDocument, uploadDocument } from "@/server/services/documents";
import { getCase, startCase } from "@/server/services/situations";
import { bookAppointment, availability } from "@/server/services/appointments";

const db = new PrismaClient();
const load = (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true, staff: true } });
type U = Awaited<ReturnType<typeof load>>;
let anna: U, petr: U, teacher: U, dekanat: U;
const made: string[] = [];
const staffOf = (u: U) => ({ id: u.staff!.id, userId: u.id, facultyId: u.staff!.facultyId });
const pdf = () => new File([readFileSync("prisma/fixtures/lecture6-bst.pdf")], "work.pdf");

beforeAll(async () => {
  [anna, petr, teacher, dekanat] = await Promise.all(["anna.lesnova", "petr.ozerov", "teacher", "dekanat"].map(load));
});
afterAll(async () => {
  await db.grade.deleteMany({ where: { requestId: { in: made } } });
  await db.exam.deleteMany({ where: { requestId: { in: made } } });
  await db.request.deleteMany({ where: { id: { in: made } } });
  await db.appointment.deleteMany({ where: { purpose: { startsWith: "СЦЕНАРИЙ" } } });
  await db.situationCase.deleteMany({ where: { studentId: anna.student!.id, code: "dorm" } });
  await db.$disconnect();
});

describe("домашнее задание: проверка и баллы", () => {
  it("сдача сигналит преподавателю; «принять с баллами» создаёт одну связанную оценку; возврат снимает её", async () => {
    const a = await db.assignment.findFirstOrThrow({ where: { teacherId: teacher.teacher!.id, groupId: anna.student!.groupId, submissions: { none: { studentId: anna.student!.id } } } });
    const sub = await submitHomework(anna.student!, a.id, "сценарий", [pdf()]);
    expect(await db.notification.count({ where: { userId: teacher.id, dedupeKey: `submitted:${sub.id}:v${sub.version}` } })).toBe(1);
    const t = { id: teacher.teacher!.id };
    expect(await reviewSubmission(t, sub.id, sub.version, "ACCEPTED", null, 17)).toBe(true);
    const g = await db.grade.findUniqueOrThrow({ where: { submissionId: sub.id } });
    expect(g.points).toBe(17);
    expect(g.kind).toBe("CURRENT");
    // исправить баллы — та же оценка, не вторая
    expect(await reviewSubmission(t, sub.id, sub.version, "ACCEPTED", null, 19)).toBe(true);
    expect(await db.grade.count({ where: { submissionId: sub.id } })).toBe(1);
    expect((await db.grade.findUniqueOrThrow({ where: { submissionId: sub.id } })).points).toBe(19);
    expect(await reviewSubmission(t, sub.id, sub.version, "RETURNED", "Добавьте вывод")).toBe(true);
    expect(await db.grade.count({ where: { submissionId: sub.id } })).toBe(0);
    await db.submission.delete({ where: { id: sub.id } });
  });
});

describe("пересдача: заявление → назначение → результат → долг закрыт", () => {
  it("деканат назначает, видит только этот студент; статус «выполнено» вручную нельзя; результат преподавателя закрывает долг", async () => {
    const before = summarize(await getEnrollments(petr.student!), petr.student!.course * 2 - 1).debts;
    expect(before.length).toBeGreaterThan(0);
    const debt = before[0];
    const r = await submitRequest(petr.student!, await db.requestType.findUniqueOrThrow({ where: { code: "APP_RETAKE" } }), { course: debt.course, reason: "" });
    made.push(r.id);
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "IN_REVIEW", null)).not.toBeNull();
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "DONE", null)).toBe("needs_result");
    const o = (await retakeOptions(staffOf(dekanat), r.id))!;
    expect(o.suggested).toBe(debt.enrollmentId);
    const when = new Date(Date.now() + 3 * 86400_000);
    await expect(scheduleRetake(staffOf(dekanat), r.id, { enrollmentId: debt.enrollmentId, startsAt: new Date(Date.now() - 1000), room: "401", teacherId: teacher.teacher!.id })).rejects.toBeInstanceOf(AcademicError);
    await scheduleRetake(staffOf(dekanat), r.id, { enrollmentId: debt.enrollmentId, startsAt: when, room: "401 В", teacherId: teacher.teacher!.id });
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("READY");
    const exam = await db.exam.findUniqueOrThrow({ where: { requestId: r.id } });
    expect((await getExams(petr.student!)).some((e) => e.id === exam.id)).toBe(true);
    expect((await getExams({ ...anna.student!, groupId: petr.student!.groupId })).some((e) => e.id === exam.id)).toBe(false); // одногруппник не видит
    const t = { id: teacher.teacher!.id, userId: teacher.id };
    await expect(recordRetakeResult(t, exam.id, "4")).rejects.toThrow(/день пересдачи/);
    await db.exam.update({ where: { id: exam.id }, data: { date: new Date(Date.now() - 3600_000) } });
    const other = await db.teacher.findFirstOrThrow({ where: { id: { not: teacher.teacher!.id } } });
    await expect(recordRetakeResult({ id: other.id, userId: teacher.id }, exam.id, "4")).rejects.toBeInstanceOf(AcademicError);
    expect(await recordRetakeResult(t, exam.id, "4")).toBe(true);
    await expect(recordRetakeResult(t, exam.id, "5")).rejects.toBeInstanceOf(AcademicError); // один раз
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("DONE");
    const after = summarize(await getEnrollments(petr.student!), petr.student!.course * 2 - 1).debts;
    expect(after.some((d) => d.enrollmentId === debt.enrollmentId)).toBe(false);
  });
});

describe("перезачёт: согласование → оценка в успеваемости", () => {
  it("после согласования деканат вносит оценку; заявка выполнена; дисциплина не «в риске»", async () => {
    const r = await submitRequest(anna.student!, await db.requestType.findUniqueOrThrow({ where: { code: "APP_RECREDIT" } }), { course: "Алгоритмы и структуры данных", prior: "Колледж, 2025", grade: "5" });
    made.push(r.id);
    await expect(recordRecredit(staffOf(dekanat), r.id, "5")).rejects.toBeInstanceOf(AcademicError); // ещё на согласовании
    const ap = await db.requestApproval.findFirstOrThrow({ where: { requestId: r.id } });
    expect(await decideApproval({ teacherId: teacher.teacher!.id, userId: teacher.id }, ap.id, "APPROVED", null)).toBe(true);
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "DONE", null)).toBe("needs_result");
    expect(await recordRecredit(staffOf(dekanat), r.id, "5")).toBe(true);
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("DONE");
    const g = await db.grade.findFirstOrThrow({ where: { requestId: r.id } });
    expect(g.kind).toBe("FINAL");
    const cur = summarize(await getEnrollments(anna.student!), anna.student!.course * 2 - 1);
    const row = cur.current.find((c) => c.enrollment.id === g.enrollmentId)!;
    expect(row.final?.value).toBe("5");
    expect(cur.risky.some((c) => c.enrollment.id === g.enrollmentId)).toBe(false);
  });
});

describe("документы в открытой заявке", () => {
  it("отклонённый документ заменяется в этой заявке: старый — в истории, новый — на проверке, заявка снова у деканата", async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#aaccee" } }).png().toBuffer();
    const d = await uploadDocument(anna.student!, "MEDICAL", new File([new Uint8Array(png)], "m.png"));
    const r = await submitRequest(anna.student!, await db.requestType.findUniqueOrThrow({ where: { code: "APP_ABSENCE" } }), { dateFrom: "2026-11-10", dateTo: "2026-11-11", reason: "Сценарий" }, { docIds: [d.id] });
    made.push(r.id);
    await expect(replaceRequestDocument(anna.student!, r.id, d.id, new File([new Uint8Array(png)], "m2.png"))).rejects.toThrow(/не принял/);
    expect(await reviewDocument(staffOf(dekanat), d.id, "REJECTED", "Нечитаемо")).toBe(true);
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "NEED_INFO", "Загрузите читаемую справку")).not.toBeNull();
    await expect(replaceRequestDocument(petr.student!, r.id, d.id, new File([new Uint8Array(png)], "x.png"))).rejects.toThrow(); // чужая заявка
    const fresh = await replaceRequestDocument(anna.student!, r.id, d.id, new File([new Uint8Array(png)], "m2.png"));
    const links = await db.requestDocument.findMany({ where: { requestId: r.id } });
    expect(links.find((l) => l.documentId === d.id)?.replacedAt).not.toBeNull();
    expect(links.find((l) => l.documentId === fresh.id)?.replacedAt).toBeNull();
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("IN_REVIEW");
    await db.studentDocument.deleteMany({ where: { id: { in: [d.id, fresh.id] } } });
  });
});

describe("план жизненной ситуации", () => {
  it("посторонняя запись на приём не закрывает шаг «Забрать направление»", async () => {
    const c = await startCase(anna.student!, "dorm");
    await db.appointment.updateMany({ where: { studentId: anna.student!.id, status: "BOOKED" }, data: { status: "CANCELLED", slotKey: null } });
    const slot = (await availability(8)).flatMap((d) => d.slots.filter((s) => s.free))[0];
    await bookAppointment(anna.student!, slot.at.toISOString(), "СЦЕНАРИЙ другая консультация");
    const view = (await getCase(anna.student!, c.id))!;
    expect(view.steps.find((s) => s.kind === "appointment")?.done).toBe(false);
  });
});
