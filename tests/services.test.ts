/**
 * Единое окно (всё выполняет деканат): обязательные документы, автовыдача, согласование перезачёта преподавателем,
 * «Мои документы» и кто их видит, запись на приём без двойного занятия слота, жизненные ситуации, отзыв справки,
 * оценка, просрочки, настройки услуг. Требует засеянную БД; за собой убирает.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { decideApproval, escalateOverdue, rateRequest, revokeCertificate, ServiceError, submitRequest } from "@/server/services/requests";
import { deleteDocument, documentForViewer, DocumentError, reviewDocument, uploadDocument } from "@/server/services/documents";
import { AppointmentError, availability, bookAppointment, cancelAppointment } from "@/server/services/appointments";
import { getCase, notifyTeachers, startCase } from "@/server/services/situations";
import { SettingsError, updateServiceSettings } from "@/server/services/analytics";
import { changeRequestStatus, listRequests } from "@/server/repos/staff";

const db = new PrismaClient();
const load = (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true, staff: true } });
type U = Awaited<ReturnType<typeof load>>;
let anna: U, petr: U, teacher: U, dekanat: U;
const made: string[] = [];
const type = (code: string) => db.requestType.findUniqueOrThrow({ where: { code } });
const staffOf = (u: U) => ({ id: u.staff!.id, userId: u.id, facultyId: u.staff!.facultyId });
const track = <T extends { id: string }>(r: T) => (made.push(r.id), r);

beforeAll(async () => {
  [anna, petr, teacher, dekanat] = await Promise.all(["anna.lesnova", "petr.ozerov", "teacher", "dekanat"].map(load));
});
afterAll(async () => {
  await db.request.deleteMany({ where: { id: { in: made } } });
  await db.appointment.deleteMany({ where: { purpose: { startsWith: "ТЕСТ" } } });
  await db.situationCase.deleteMany({ where: { studentId: anna.student!.id, code: "sick" } });
  await db.studentDocument.deleteMany({ where: { studentId: petr.student!.id, kind: "INN" } });
  await db.$disconnect();
});

describe("услуги деканата", () => {
  it("без обязательных документов — ошибка; с документами из «Моих» — заявка у деканата с документами и сроком", async () => {
    const t = await type("DORM_CHECKIN");
    await expect(submitRequest(petr.student!, t, { dateFrom: "2026-12-01", wish: "" })).rejects.toBeInstanceOf(ServiceError);
    const docs = await db.studentDocument.findMany({ where: { studentId: anna.student!.id, kind: { in: ["PASSPORT", "FLUORO"] } } });
    const r = track(await submitRequest(anna.student!, t, { dateFrom: "2026-12-01", wish: "" }, { docIds: docs.map((d) => d.id) }));
    expect(r.dueAt).not.toBeNull();
    expect(await db.requestDocument.count({ where: { requestId: r.id } })).toBe(2);
    expect((await listRequests(staffOf(dekanat), {})).some((x) => x.id === r.id)).toBe(true);
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "IN_REVIEW", null)).not.toBeNull();
  });

  it("материальная помощь — только с реквизитами карты; решает деканат без лишних согласований", async () => {
    const t = await type("APP_MATHELP");
    await expect(submitRequest(petr.student!, t, { reason: "Болезнь", text: "x" })).rejects.toBeInstanceOf(ServiceError);
    const bank = await db.studentDocument.findFirstOrThrow({ where: { studentId: anna.student!.id, kind: "BANK" } });
    const r = track(await submitRequest(anna.student!, t, { reason: "Болезнь", text: "Тест" }, { docIds: [bank.id] }));
    expect(await db.requestApproval.count({ where: { requestId: r.id } })).toBe(0);
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "IN_REVIEW", null)).not.toBeNull();
  });

  it("справка об обучении — готова сразу (с QR); с бумажной копией — обычным порядком", async () => {
    const t = await type("CERT_STUDY");
    const auto = track(await submitRequest(anna.student!, t, { place: "В банк", copies: "1" }));
    const a = await db.request.findUniqueOrThrow({ where: { id: auto.id }, include: { certificate: true } });
    expect(a.status).toBe("READY");
    expect(a.autoIssued).toBe(true);
    expect(a.certificate).not.toBeNull();
    const paper = track(await submitRequest(anna.student!, t, { place: "В банк", copies: "1" }, { wantsPaper: true }));
    expect((await db.request.findUniqueOrThrow({ where: { id: paper.id } })).status).toBe("NEW");
  });

  it("отозванная справка не подтверждается и студент получает уведомление", async () => {
    const r = track(await submitRequest(anna.student!, await type("CERT_STUDY"), { place: "По месту работы", copies: "1" }));
    await expect(revokeCertificate(staffOf(dekanat), r.id, "")).rejects.toBeInstanceOf(ServiceError);
    expect(await revokeCertificate(staffOf(dekanat), r.id, "Ошибка в группе")).toBe(true);
    expect((await db.certificate.findUniqueOrThrow({ where: { requestId: r.id } })).revoked).toBe(true);
    expect(await revokeCertificate(staffOf(dekanat), r.id, "ещё раз")).toBe(false);
  });
});

describe("согласование перезачёта", () => {
  it("сначала преподаватель дисциплины; чужой преподаватель решить не может; отказ — только с причиной; потом — деканат", async () => {
    const t = await type("APP_RECREDIT");
    await expect(submitRequest(anna.student!, t, { course: "Несуществующая дисциплина", prior: "x", grade: "5" })).rejects.toBeInstanceOf(ServiceError);
    const r = track(await submitRequest(anna.student!, t, { course: "Алгоритмы и структуры данных", prior: "Колледж, 2025", grade: "5" }));
    const ap = await db.requestApproval.findFirstOrThrow({ where: { requestId: r.id } });
    expect(ap.status).toBe("PENDING");
    expect(ap.teacherId).toBe(teacher.teacher!.id);
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "IN_REVIEW", null)).toBeNull(); // пока идёт согласование
    const other = await db.teacher.findFirstOrThrow({ where: { id: { not: teacher.teacher!.id } } });
    expect(await decideApproval({ teacherId: other.id, userId: anna.id }, ap.id, "APPROVED", null)).toBeNull();
    const me = { teacherId: teacher.teacher!.id, userId: teacher.id };
    await expect(decideApproval(me, ap.id, "REJECTED", "")).rejects.toBeInstanceOf(ServiceError);
    expect(await decideApproval(me, ap.id, "APPROVED", "Курс совпадает")).toBe(true);
    expect(await decideApproval(me, ap.id, "APPROVED", null)).toBeNull(); // повторный клик
    expect(await changeRequestStatus(staffOf(dekanat), r.id, "IN_REVIEW", null)).not.toBeNull();
  });

  it("отказ преподавателя отклоняет заявку", async () => {
    const r = track(await submitRequest(anna.student!, await type("APP_RECREDIT"), { course: "Алгоритмы и структуры данных", prior: "x", grade: "3" }));
    const ap = await db.requestApproval.findFirstOrThrow({ where: { requestId: r.id } });
    expect(await decideApproval({ teacherId: teacher.teacher!.id, userId: teacher.id }, ap.id, "REJECTED", "Объём курса меньше")).toBe(true);
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("REJECTED");
  });
});

describe("«Мои документы»", () => {
  it("фото перекодируется в JPEG; видят владелец и деканат, не видят преподаватель и другой студент", async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#88aaff" } }).png().toBuffer();
    const d = await uploadDocument(petr.student!, "INN", new File([new Uint8Array(png)], "inn.png"));
    expect(d.mime).toBe("image/jpeg");
    await expect(uploadDocument(petr.student!, "INN", new File(["<html>"], "x.pdf"))).rejects.toBeInstanceOf(DocumentError);
    await expect(uploadDocument(petr.student!, "FLUORO", new File([new Uint8Array(png)], "f.png"))).rejects.toThrow(/до какого числа/);
    expect(await documentForViewer(petr, d.id)).not.toBeNull();
    expect(await documentForViewer(anna, d.id)).toBeNull();
    expect(await documentForViewer(teacher, d.id)).toBeNull();
    expect(await documentForViewer(dekanat, d.id)).not.toBeNull();
    await expect(reviewDocument(staffOf(dekanat), d.id, "REJECTED", "")).rejects.toBeInstanceOf(DocumentError);
    expect(await reviewDocument(staffOf(dekanat), d.id, "REJECTED", "Нечитаемо")).toBe(true);
    expect(await db.notification.count({ where: { userId: petr.id, dedupeKey: `doc-rejected:${d.id}` } })).toBe(1);
  });

  it("документ, приложенный к заявке в работе, удалить нельзя", async () => {
    const used = await db.requestDocument.findFirstOrThrow({ where: { document: { studentId: petr.student!.id }, request: { status: { in: ["NEW", "IN_REVIEW", "NEED_INFO"] } } } });
    await expect(deleteDocument(petr.student!, used.documentId)).rejects.toBeInstanceOf(DocumentError);
  });
});

describe("запись на приём в деканат", () => {
  it("свободный слот занимает один человек; отмена освобождает; за час — напоминание", async () => {
    const slot = (await availability(6)).flatMap((d) => d.slots.filter((s) => s.free))[0];
    const a = await bookAppointment(anna.student!, slot.at.toISOString(), "ТЕСТ справка");
    await expect(bookAppointment(petr.student!, slot.at.toISOString(), "ТЕСТ тоже хочу")).rejects.toBeInstanceOf(AppointmentError);
    await expect(bookAppointment(anna.student!, new Date(slot.at.getTime() + 60_000).toISOString(), "ТЕСТ кривое время")).rejects.toBeInstanceOf(AppointmentError);
    expect(await db.reminder.count({ where: { userId: anna.id, link: "/services/appointments", sentAt: null } })).toBeGreaterThan(0);
    expect(await cancelAppointment(anna.student!, a.id)).toBe(true);
    expect((await bookAppointment(petr.student!, slot.at.toISOString(), "ТЕСТ после отмены")).id).toBeTruthy();
    expect((await availability(6)).flatMap((d) => d.slots).find((s) => s.at.getTime() === slot.at.getTime())?.free).toBe(false);
  });
});

describe("жизненные ситуации", () => {
  it("один открытый план на ситуацию; шаги считаются по данным; преподаватели получают уведомление один раз", async () => {
    const c1 = await startCase(anna.student!, "sick");
    expect((await startCase(anna.student!, "sick")).id).toBe(c1.id);
    expect((await getCase(anna.student!, c1.id))?.steps.find((s) => s.key === "absence")?.done).toBe(false);
    track(await submitRequest(anna.student!, await type("APP_ABSENCE"), { dateFrom: "2026-11-20", dateTo: "2026-11-22", reason: "Болезнь" }, { caseId: c1.id }));
    expect((await getCase(anna.student!, c1.id))?.steps.find((s) => s.key === "absence")?.done).toBe(true);
    expect(await notifyTeachers({ ...anna.student!, lastName: anna.student!.lastName, firstName: anna.student!.firstName }, c1.id, "2026-11-20", "2026-11-22", "")).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { userId: teacher.id, dedupeKey: `sick:${c1.id}` } })).toBe(1);
    await expect(notifyTeachers({ ...anna.student!, lastName: "x", firstName: "y" }, c1.id, "2026-11-20", "2026-11-22", "")).rejects.toThrow(/уже/);
    expect(await getCase(petr.student!, c1.id)).toBeNull();
  });
});

describe("оценка, просрочки, настройки", () => {
  it("оценка — один раз и только после завершения", async () => {
    const r = track(await submitRequest(anna.student!, await type("CERT_STUDY"), { place: "Тест", copies: "1" }));
    expect(await rateRequest(petr.student!, r.id, 5, null)).toBe(false);
    expect(await rateRequest(anna.student!, r.id, 4, "ок")).toBe(true);
    expect(await rateRequest(anna.student!, r.id, 5, null)).toBe(false);
    await expect(rateRequest(anna.student!, r.id, 7, null)).rejects.toBeInstanceOf(ServiceError);
  });

  it("просроченная заявка уходит руководителю деканата один раз", async () => {
    const old = await db.request.findFirstOrThrow({ where: { type: { code: "APP_MATHELP" }, status: "NEW", approvals: { none: {} } } });
    await db.request.update({ where: { id: old.id }, data: { dueAt: new Date(Date.now() - 86400000), escalatedAt: null } });
    await escalateOverdue();
    expect((await db.request.findUniqueOrThrow({ where: { id: old.id } })).escalatedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: dekanat.id, dedupeKey: `overdue:${old.id}` } })).toBe(1);
  });

  it("настройки услуг: только деканат вуза; автовыдача — только у справок без согласования", async () => {
    const t = await type("APP_MATHELP");
    await expect(updateServiceSettings({ ...staffOf(dekanat), facultyId: "some" }, t.id, { slaDays: 5, autoIssue: false, enabled: true })).rejects.toBeInstanceOf(SettingsError);
    await expect(updateServiceSettings(staffOf(dekanat), t.id, { slaDays: 5, autoIssue: true, enabled: true })).rejects.toBeInstanceOf(SettingsError);
    const bank = await type("ACC_BANK");
    expect(await updateServiceSettings(staffOf(dekanat), bank.id, { slaDays: 2, autoIssue: false, enabled: false })).toBe(true);
    await expect(submitRequest(anna.student!, await type("ACC_BANK"), { bank: "x" })).rejects.toThrow(/недоступна/);
    await updateServiceSettings(staffOf(dekanat), bank.id, { slaDays: 3, autoIssue: false, enabled: true });
  });
});
