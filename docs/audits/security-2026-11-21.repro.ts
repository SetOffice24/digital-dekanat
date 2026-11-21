/** Audit evidence tests: PASS means the documented defect is reproduced, NOT fixed.
 * No real DB, disk writes, push requests or AI calls. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";

const db = vi.hoisted(() => ({
  pushSubscription: { findUnique: vi.fn(), upsert: vi.fn() },
  attachment: { findUnique: vi.fn() }, lesson: { count: vi.fn() },
  enrollment: { findUnique: vi.fn() }, grade: { create: vi.fn() },
  request: { findFirst: vi.fn(), update: vi.fn() },
  reminder: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
}));
const notification = vi.hoisted(() => vi.fn());
const drafts = vi.hoisted(() => ({ getDraftMessage: vi.fn(), markDraftDone: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/notify", () => ({ notify: notification }));
vi.mock("@/server/auth", () => ({ getCurrentUser: async () => ({ id: "audit-user" }) }));
vi.mock("@/server/repos/assistant", () => drafts);

import { savePushSubscription } from "@/server/push";
import { canAccessAttachment, checkContent } from "@/server/files";
import { addGrade, teachesPair } from "@/server/repos/teacher";
import { answerRequest } from "@/server/repos/student";
import { deliverDueReminders } from "@/server/reminders";
import { createReminderAction } from "@/app/reminder-actions";

beforeEach(() => { vi.resetAllMocks(); notification.mockResolvedValue(undefined); });

describe("security audit: reproductions of CURRENT defects", () => {
  it("two simultaneous confirmations create two reminders from one draft", async () => {
    drafts.getDraftMessage.mockResolvedValue({ draft: { kind: "REMINDER" } });
    drafts.markDraftDone.mockResolvedValue(true);
    db.reminder.count.mockResolvedValue(0);
    db.reminder.create.mockResolvedValue({ id: "r" });
    const dueAt = new Date(Date.now() + 86400_000).toISOString().slice(0, 16);
    const results = await Promise.all([createReminderAction("draft", { text: "Audit reminder", dueAt }), createReminderAction("draft", { text: "Audit reminder", dueAt })]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(db.reminder.create).toHaveBeenCalledTimes(2);
  });
  it("accepts private HTTPS push targets and web-push builds a request to them", async () => {
    db.pushSubscription.findUnique.mockResolvedValue(null);
    db.pushSubscription.upsert.mockResolvedValue({});
    const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
    const keys = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
    for (const endpoint of ["https://127.0.0.1:8443/internal", "https://10.0.0.1/private", "https://[::1]/internal"]) {
      expect(await savePushSubscription("audit-user", { endpoint, keys })).toBe(true);
      const request = webpush.generateRequestDetails({ endpoint, keys }, "audit", { vapidDetails: { subject: "mailto:audit@example.test", ...webpush.generateVAPIDKeys() } });
      expect(request.endpoint).toBe(endpoint);
    }
  });

  it("denies expired teaching scope for journal but permits the same scope for files", async () => {
    db.lesson.count.mockImplementation(async ({ where }) => where.date ? 0 : 1);
    db.attachment.findUnique.mockResolvedValue({ id: "file", material: { groupId: "old-group", courseId: "course" }, assignment: null, submission: null, message: null });
    expect(await teachesPair({ id: "teacher" }, "old-group", "course")).toBe(false);
    expect(await canAccessAttachment({ id: "user", role: "TEACHER", teacher: { id: "teacher" }, student: null }, "file")).not.toBeNull();
  });

  it("allows a current teacher to change an enrollment from a past semester", async () => {
    db.enrollment.findUnique.mockResolvedValue({ courseId: "course", semester: 1, course: { name: "Course" }, student: { userId: "student-user", groupId: "current-group" } });
    db.lesson.count.mockResolvedValue(1);
    db.grade.create.mockResolvedValue({ id: "grade" });
    await addGrade({ id: "teacher" }, "old-semester-enrollment", 20, "Тест");
    expect(db.grade.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ enrollmentId: "old-semester-enrollment" }) }));
    expect(db.enrollment.findUnique.mock.calls[0][0].select).not.toHaveProperty("semester");
  });

  it("accepts fake PDF and OOXML bytes without a real document container", () => {
    expect(() => checkContent("fake.pdf", Buffer.from("%PDF-this is not a PDF"))).not.toThrow();
    expect(() => checkContent("fake.docx", Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from("[Content_Types].xml word/not-a-zip")]))).not.toThrow();
  });

  it("student reply can overwrite a concurrent terminal request status", async () => {
    let status = "NEED_INFO";
    db.request.findFirst.mockImplementation(async () => { const snapshot = { id: "r", status }; status = "REJECTED"; return snapshot; });
    db.request.update.mockImplementation(async ({ where, data }) => { expect(where).toEqual({ id: "r" }); status = data.status; return { id: "r", status }; });
    await answerRequest({ id: "s", userId: "u", groupId: "g", facultyId: "f", subgroup: 1, course: 1 }, "r", "reply");
    expect(status).toBe("IN_REVIEW");
  });

  it("marks reminder as sent before failed notification and never retries it", async () => {
    let sent = false;
    db.reminder.findMany.mockImplementation(async () => sent ? [] : [{ id: "r", userId: "u", text: "Reminder", link: null }]);
    db.reminder.updateMany.mockImplementation(async () => { sent = true; return { count: 1 }; });
    notification.mockRejectedValue(new Error("simulated database failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await deliverDueReminders(); await deliverDueReminders();
      expect(sent).toBe(true); expect(notification).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
});
