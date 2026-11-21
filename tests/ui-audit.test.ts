/**
 * Повторный UI-аудит (docs/audits/ui-ux-internal-browser-2026-11-21.md):
 * R01 — перенос без выбора времени сохраняет текущее время; «ничего не изменилось» не переносит;
 * R02 — напоминание о дедлайне без своей ссылки ведёт на страницу дела, а не на главную.
 * Требует засеянную БД; за собой убирает.
 */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { moveLesson } from "@/server/repos/staff";
import { remindDeadlines } from "@/server/notify";

const db = new PrismaClient();
afterAll(() => db.$disconnect());

describe("R01: перенос пары", () => {
  it("смена только аудитории оставляет время; без изменений — отказ", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { login: "dekanat" }, include: { staff: true } });
    const staff = { id: u.staff!.id, userId: u.id, facultyId: u.staff!.facultyId };
    const l = await db.lesson.findFirstOrThrow({ where: { status: "SCHEDULED", startTime: { not: "08:30" }, group: { name: "ИВТ-24-1" } } });
    try {
      expect(await moveLesson(staff, l.id, { date: l.date, startTime: null, endTime: null, room: l.room, reason: "Проверка" })).toBe("unchanged");
      const r = await moveLesson(staff, l.id, { date: l.date, startTime: null, endTime: null, room: "999", reason: "Проверка" });
      expect(r && r !== "unchanged" && r.summary).toMatch(/Новая аудитория/);
      const after = await db.lesson.findUniqueOrThrow({ where: { id: l.id } });
      expect([after.startTime, after.endTime, after.room]).toEqual([l.startTime, l.endTime, "999"]);
    } finally {
      await db.lesson.update({ where: { id: l.id }, data: { status: l.status, room: l.room, startTime: l.startTime, endTime: l.endTime, date: l.date, movedFromDate: l.movedFromDate, movedFromTime: l.movedFromTime, changeNote: l.changeNote, changedAt: l.changedAt } });
      await db.notification.deleteMany({ where: { body: { contains: "Причина: Проверка" } } });
    }
  });
});

describe("R02: ссылка напоминания о дедлайне", () => {
  it("дедлайн без ссылки ведёт на /deadlines/<id>", async () => {
    const s = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
    const d = await db.deadline.create({ data: { title: "ТЕСТ дедлайн", dueAt: new Date(Date.now() + 36 * 3600_000), audience: "GROUP", groupId: s.groupId } });
    try {
      await remindDeadlines(s);
      const n = await db.notification.findFirstOrThrow({ where: { userId: s.userId, dedupeKey: { startsWith: `deadline:${d.id}:` } } });
      expect(n.link).toBe(`/deadlines/${d.id}`);
    } finally {
      await db.notification.deleteMany({ where: { dedupeKey: { startsWith: `deadline:${d.id}:` } } });
      await db.deadline.delete({ where: { id: d.id } });
    }
  });
});
