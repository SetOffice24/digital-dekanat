/**
 * Напоминания и сводка «на сегодня». Требует засеянную БД; создаёт и удаляет свои напоминания.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type User } from "@prisma/client";
import { deliverDueReminders } from "@/server/reminders";
import { loadWidget } from "@/server/ai/widgets";

const db = new PrismaClient();
let anna: User, petr: User;
const load = (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true, staff: true } });

beforeAll(async () => {
  anna = await db.user.findUniqueOrThrow({ where: { login: "anna.lesnova" } });
  petr = await db.user.findUniqueOrThrow({ where: { login: "petr.ozerov" } });
});
afterAll(async () => {
  await db.reminder.deleteMany({ where: { text: { startsWith: "ТЕСТ " } } });
  await db.notification.deleteMany({ where: { dedupeKey: { startsWith: "reminder:" }, body: { startsWith: "ТЕСТ " } } });
  await db.$disconnect();
});

describe("доставка напоминаний", () => {
  it("наступившее — одно уведомление (повторный вызов не дублирует); будущее — ждёт", async () => {
    const due = await db.reminder.create({ data: { userId: anna.id, text: "ТЕСТ сдать отчёт", dueAt: new Date(Date.now() - 60_000) } });
    const later = await db.reminder.create({ data: { userId: anna.id, text: "ТЕСТ потом", dueAt: new Date(Date.now() + 3600_000) } });
    await deliverDueReminders(anna.id);
    await deliverDueReminders(anna.id);
    expect(await db.notification.count({ where: { userId: anna.id, dedupeKey: `reminder:${due.id}` } })).toBe(1);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: due.id } })).sentAt).not.toBeNull();
    expect((await db.reminder.findUniqueOrThrow({ where: { id: later.id } })).sentAt).toBeNull();
  });

  it("список напоминаний — только свои", async () => {
    await db.reminder.create({ data: { userId: petr.id, text: "ТЕСТ чужое", dueAt: new Date(Date.now() + 3600_000) } });
    const mine = (await loadWidget(await load("anna.lesnova"), "any.reminders", {})) as { items: { text: string }[] };
    expect(mine.items.some((r) => r.text === "ТЕСТ чужое")).toBe(false);
    expect(mine.items.some((r) => r.text === "ТЕСТ потом")).toBe(true);
  });
});

describe("сводка «на сегодня»", () => {
  it("каждая роль получает свою сводку; чужой роли — нет", async () => {
    const student = await load("anna.lesnova");
    const teacher = await load("teacher");
    const staff = await load("dekanat");
    expect(await loadWidget(student, "student.today", {})).toHaveProperty("lessons");
    expect(await loadWidget(teacher, "teacher.today", {})).toHaveProperty("pending");
    expect(await loadWidget(staff, "staff.today", {})).toHaveProperty("fresh");
    expect(await loadWidget(student, "staff.today", {})).toBeNull();
    expect(await loadWidget(teacher, "student.today", {})).toBeNull();
  });
});
