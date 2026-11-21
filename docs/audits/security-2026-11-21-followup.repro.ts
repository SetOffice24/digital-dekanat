/** Evidence tests. PASS reproduces a defect, except explicitly labelled guard checks.
 * No real DB, uploads, push or AI requests. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestType } from "@prisma/client";
const db = vi.hoisted(() => ({
  requestApproval: { findFirst: vi.fn(), updateMany: vi.fn() },
  request: { updateMany: vi.fn(), findMany: vi.fn(), create: vi.fn() }, requestEvent: { create: vi.fn() },
  appointment: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  reminder: { create: vi.fn() }, lesson: { findMany: vi.fn(), findFirst: vi.fn() }, caseStep: { findMany: vi.fn() },
  $transaction: vi.fn(), studentDocument: { findFirst: vi.fn() },
}));
const notify = vi.hoisted(() => vi.fn());
const pdf = vi.hoisted(() => ({ numPages: 151, destroy: vi.fn() }));
const extract = vi.hoisted(() => ({ word: vi.fn(), pdf: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/notify", () => ({ notify }));
vi.mock("unpdf", () => ({ getDocumentProxy: async () => pdf, extractText: extract.pdf }));
vi.mock("mammoth", () => ({ extractRawText: extract.word }));
import { decideApproval, submitRequest } from "@/server/services/requests";
import { availability, bookAppointment, markAppointment } from "@/server/services/appointments";
import { absentStudents } from "@/server/services/teacher";
import { documentForViewer } from "@/server/services/documents";
import { extractText } from "@/server/knowledge/text";
import { canEdit, visibleWhere } from "@/server/repos/knowledge";

const student = { id: "student", userId: "student-user" };
const staff = { id: "staff", userId: "staff-user", facultyId: "faculty" };
const slots = ["10:00", "10:15", "10:30"].map((t) => `2026-11-23T${t}:00+03:00`);
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-21T09:00:00Z"));
  notify.mockResolvedValue(undefined); db.$transaction.mockImplementation(async (f) => f(db));
});
afterEach(() => vi.useRealTimers());

describe("follow-up audit: defect reproductions", () => {
  it("routes approval by an arbitrary group lesson without the student's subgroup", async () => {
    db.lesson.findFirst.mockResolvedValue({ teacherId: "teacher-other-subgroup", teacher: { userId: "other-teacher-user" } });
    db.request.create.mockResolvedValue({ id: "r", number: 1 });
    const type = { id: "type", title: "Перезачёт", enabled: true, docs: [], route: [{ kind: "TEACHER" }], autoIssue: false, isCertificate: false, slaDays: 3 } as unknown as RequestType;
    const sessionStudent = { ...student, groupId: "g", facultyId: "f", subgroup: 1 };
    await submitRequest(sessionStudent, type, { course: "Дисциплина" });
    expect(db.lesson.findFirst.mock.calls[0][0].where).not.toHaveProperty("subgroup");
    expect(db.lesson.findFirst.mock.calls[0][0].where).not.toHaveProperty("OR");
    expect(db.request.create.mock.calls[0][0].data.approvals.create[0].teacher.connect.id).toBe("teacher-other-subgroup");
  });
  it("records rejection on a terminal DONE request and emits a false rejected event", async () => {
    db.requestApproval.findFirst.mockResolvedValue({ id: "approval", idx: 0, requestId: "r", request: { number: 1, status: "DONE", student: { userId: "s", facultyId: "f" }, type: { title: "Перезачёт" } } });
    db.requestApproval.updateMany.mockResolvedValue({ count: 1 });
    db.request.updateMany.mockResolvedValue({ count: 0 });
    expect(await decideApproval({ teacherId: "t", userId: "u" }, "approval", "REJECTED", "Причина")).toBe(true);
    expect(db.requestEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromStatus: "DONE", toStatus: "REJECTED" }) });
    expect(notify).toHaveBeenCalledWith(["s"], expect.objectContaining({ title: "Перезачёт: не согласовано" }));
    expect(db.requestApproval.findFirst.mock.calls[0][0].where).not.toHaveProperty("request");
  });
  it("three concurrent bookings bypass the quota of two", async () => {
    db.appointment.count.mockResolvedValue(0);
    db.appointment.create.mockImplementation(async ({ data }) => ({ id: data.slotKey }));
    db.reminder.create.mockResolvedValue({});
    const results = await Promise.all(slots.map((at) => bookAppointment(student, at, "Audit booking")));
    expect(results).toHaveLength(3); expect(db.appointment.create).toHaveBeenCalledTimes(3);
  });
  it("returns failure after a booking has already committed when reminder creation fails", async () => {
    db.appointment.count.mockResolvedValue(0); db.appointment.create.mockResolvedValue({ id: "persisted" });
    db.reminder.create.mockRejectedValue(new Error("reminder storage unavailable"));
    await expect(bookAppointment(student, slots[0], "Audit booking")).rejects.toThrow("reminder storage unavailable");
    expect(db.appointment.create).toHaveBeenCalledTimes(1); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("marks a future slot DONE without releasing its unique key, while availability ignores it", async () => {
    vi.setSystemTime(new Date("2026-11-23T06:00:00Z"));
    db.appointment.updateMany.mockResolvedValue({ count: 1 });
    expect(await markAppointment(staff, "a", "DONE")).toBe(true);
    expect(db.appointment.updateMany.mock.calls[0][0].data).toEqual({ status: "DONE" });
    db.appointment.findMany.mockResolvedValue([]);
    const days = await availability(1);
    expect(db.appointment.findMany.mock.calls[0][0].where.status).toBe("BOOKED");
    expect(days[0].slots.find((s) => s.at.toISOString() === new Date(slots[0]).toISOString())?.free).toBe(true);
  });
  it("returns the full free-text absence reason to a teacher of the group without subgroup filtering", async () => {
    db.lesson.findMany.mockResolvedValue([{ groupId: "g" }]); db.caseStep.findMany.mockResolvedValue([]);
    db.request.findMany.mockResolvedValue([{ id: "r", status: "NEW", payload: { dateFrom: "2026-11-21", dateTo: "2026-11-24", reason: "Вымышленная медицинская подробность" }, student: { lastName: "Тестов", firstName: "Студент", group: { name: "Группа" } } }]);
    const result = await absentStudents("teacher");
    expect(result[0].reason).toBe("Вымышленная медицинская подробность");
    expect(db.request.findMany.mock.calls[0][0].where.student).toEqual({ groupId: { in: ["g"] } });
  });
  it("timeout rejects the caller but does not cancel the document parser", async () => {
    let resolve!: (value: { value: string }) => void; let completed = false;
    extract.word.mockImplementation(() => new Promise<{ value: string }>((r) => { resolve = r; }).then((v) => { completed = true; return v; }));
    const pending = extractText("audit.docx", Buffer.from("mock"));
    const assertion = expect(pending).rejects.toThrow("слишком сложный");
    await vi.advanceTimersByTimeAsync(20_001); await assertion;
    expect(completed).toBe(false); resolve({ value: "Тестовый текст ".repeat(5) });
    await Promise.resolve(); expect(completed).toBe(true);
  });
  it("does not destroy an opened PDF when page limit rejects it", async () => {
    await expect(extractText("audit.pdf", Buffer.from("mock"))).rejects.toThrow("150");
    expect(pdf.destroy).not.toHaveBeenCalled();
  });
});

describe("follow-up audit: guard checks", () => {
  it("faculty staff cannot edit a university-wide library document", () => {
    expect(canEdit({ id: "u", role: "STAFF", staff: { id: "s", facultyId: "f" }, student: null, teacher: null }, { authorId: "other", scope: "UNIVERSITY", facultyId: null })).toBe(false);
  });
  it("student library scope requests only current teaching links", async () => {
    db.lesson.findMany.mockResolvedValue([]);
    await visibleWhere({ id: "u", role: "STUDENT", student: { id: "s", groupId: "g", facultyId: "f" }, staff: null, teacher: null });
    expect(db.lesson.findMany.mock.calls[0][0].where.date.gte).toBeInstanceOf(Date);
  });
  it("document download denies teachers and filters another student by session owner", async () => {
    expect(await documentForViewer({ id: "t", role: "TEACHER", student: null, staff: null }, "doc")).toBeNull();
    expect(db.studentDocument.findFirst).not.toHaveBeenCalled();
    db.studentDocument.findFirst.mockResolvedValue(null);
    expect(await documentForViewer({ id: "u", role: "STUDENT", student: { id: "s" }, staff: null }, "foreign-doc")).toBeNull();
    expect(db.studentDocument.findFirst.mock.calls[0][0].where).toEqual({ id: "foreign-doc", studentId: "s" });
  });
});
