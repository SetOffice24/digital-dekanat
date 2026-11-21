/** Evidence of current cross-role behavior; passing does not mean the gaps are fixed. */
import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ submission: { findUnique: vi.fn(), updateMany: vi.fn() }, lesson: { count: vi.fn() }, grade: { create: vi.fn() }, situationCase: { findFirst: vi.fn() }, studentDocument: { findMany: vi.fn() }, appointment: { findMany: vi.fn() }, studentPhoto: { findFirst: vi.fn() }, pushSubscription: { count: vi.fn() } }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/notify", () => ({ notify }));
import { reviewSubmission } from "@/server/repos/homework";
import { getCase } from "@/server/services/situations";
beforeEach(() => vi.resetAllMocks());
it("accepting homework changes its status but creates no grade", async () => {
  db.submission.findUnique.mockResolvedValue({ version: 1, status: "SUBMITTED", teacherComment: null, assignment: { id: "a", title: "Работа", groupId: "g", courseId: "c", course: { name: "Курс" } }, student: { userId: "s" } });
  db.lesson.count.mockResolvedValue(1); db.submission.updateMany.mockResolvedValue({ count: 1 }); notify.mockResolvedValue(undefined);
  expect(await reviewSubmission({ id: "t" }, "sub", 1, "ACCEPTED", null)).toBe(true);
  expect(db.grade.create).not.toHaveBeenCalled();
});
it("an unrelated appointment satisfies a situation's appointment step", async () => {
  db.situationCase.findFirst.mockResolvedValue({ id: "case", code: "dorm", createdAt: new Date("2026-01-01"), steps: [], requests: [] });
  db.studentDocument.findMany.mockResolvedValue([]); db.appointment.findMany.mockResolvedValue([{ startsAt: new Date("2026-12-01"), status: "BOOKED" }]);
  db.studentPhoto.findFirst.mockResolvedValue(null); db.pushSubscription.count.mockResolvedValue(0);
  const c = await getCase({ id: "s", userId: "u", groupId: "g", subgroup: 1 }, "case");
  expect(c?.steps.find((x) => x.kind === "appointment")?.done).toBe(true);
  expect(db.appointment.findMany.mock.calls[0][0].where).not.toHaveProperty("requestId");
});
it("a pending student photo counts as completed in the freshman checklist", async () => {
  db.situationCase.findFirst.mockResolvedValue({ id: "case", code: "freshman", createdAt: new Date(), steps: [], requests: [] });
  db.studentDocument.findMany.mockResolvedValue([]); db.appointment.findMany.mockResolvedValue([]); db.studentPhoto.findFirst.mockResolvedValue({ status: "PENDING" }); db.pushSubscription.count.mockResolvedValue(0);
  const c = await getCase({ id: "s", userId: "u", groupId: "g", subgroup: 1 }, "case");
  expect(c?.steps.find((x) => x.key === "photo")).toMatchObject({ done: true, status: "на проверке" });
});
