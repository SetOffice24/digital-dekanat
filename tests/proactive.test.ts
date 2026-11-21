/**
 * Помощник пишет первым: подсказки из данных, утренняя сводка раз в день, вечером — только новое срочное,
 * без повторов, push только для срочного, точка «не прочитано». Требует засеянную БД; за собой убирает.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Student, type User } from "@prisma/client";
import { deliverStudentDigest, studentNudges, unseenProactive } from "@/server/proactive";
import { isoDate, moscowToday } from "@/lib/utils";

const db = new PrismaClient();
let anna: User & { student: Student | null };
const assignmentIds: string[] = [];
const day = isoDate(moscowToday());
const at = (hhmm: string) => new Date(`${day}T${hhmm}:00+03:00`);

async function clean() {
  await db.nudgeLog.deleteMany({ where: { userId: anna.id } });
  await db.aiChat.deleteMany({ where: { userId: anna.id, messages: { some: { proactive: true } } } });
  await db.notification.deleteMany({ where: { userId: anna.id, dedupeKey: { startsWith: "nudge:" } } });
}

beforeAll(async () => {
  anna = await db.user.findUniqueOrThrow({ where: { login: "anna.lesnova" }, include: { student: true } });
  await clean();
  // задание её группе со сроком через 10 часов — срочное
  const l = await db.lesson.findFirstOrThrow({ where: { groupId: anna.student!.groupId }, select: { courseId: true, teacherId: true } });
  const a = await db.assignment.create({ data: { groupId: anna.student!.groupId, courseId: l.courseId, teacherId: l.teacherId, title: "ТЕСТ срочное задание", description: "x", dueAt: new Date(Date.now() + 10 * 3600_000) } });
  assignmentIds.push(a.id);
});
afterAll(async () => {
  await clean();
  await db.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await db.$disconnect();
});

describe("подсказки из данных студента", () => {
  it("срок меньше суток — срочно и первым, с кнопкой «Сдать»", async () => {
    const items = await studentNudges(anna.student!);
    const hw = items.find((n) => n.key === `hw-due:${assignmentIds[0]}`);
    expect(hw?.urgent).toBe(true);
    expect(hw?.action?.tool).toBe("submit");
    expect(items[0].weight).toBeGreaterThanOrEqual(items[items.length - 1].weight);
  });
});

describe("сообщение «сам»", () => {
  it("до 7 утра не пишет", async () => {
    expect(await deliverStudentDigest({ ...anna.student!, firstName: "Анна" }, at("06:30"))).toBeNull();
  });

  it("утром — одна сводка в новом чате, второй раз за день — нет; срочное — push", async () => {
    const chatId = await deliverStudentDigest({ ...anna.student!, firstName: "Анна" }, at("09:00"));
    expect(chatId).toBeTruthy();
    const msg = await db.aiMessage.findFirstOrThrow({ where: { chatId: chatId! } });
    expect(msg.proactive).toBe(true);
    expect(msg.content).toMatch(/^Доброе утро, Анна!/);
    expect(msg.content).toContain("ТЕСТ срочное задание");
    expect(await deliverStudentDigest({ ...anna.student!, firstName: "Анна" }, at("10:00"))).toBeNull();
    expect(await db.notification.count({ where: { userId: anna.id, dedupeKey: `nudge:day:${day}` } })).toBe(1);
  });

  it("точка «не прочитано» гаснет, когда чат открыли", async () => {
    const chatId = await unseenProactive(anna.id);
    expect(chatId).toBeTruthy();
    await db.aiChat.update({ where: { id: chatId! }, data: { seenAt: new Date() } });
    expect(await unseenProactive(anna.id)).toBeNull();
  });

  it("вечером — только новое срочное; о старом не повторяет", async () => {
    const l = await db.lesson.findFirstOrThrow({ where: { groupId: anna.student!.groupId }, select: { courseId: true, teacherId: true } });
    const b = await db.assignment.create({ data: { groupId: anna.student!.groupId, courseId: l.courseId, teacherId: l.teacherId, title: "ТЕСТ вечернее задание", description: "x", dueAt: new Date(Date.now() + 5 * 3600_000) } });
    assignmentIds.push(b.id);
    const chatId = await deliverStudentDigest({ ...anna.student!, firstName: "Анна" }, at("19:00"));
    const msg = await db.aiMessage.findFirstOrThrow({ where: { chatId: chatId! } });
    expect(msg.content).toContain("ТЕСТ вечернее задание");
    expect(msg.content).not.toContain("ТЕСТ срочное задание");
    expect(await deliverStudentDigest({ ...anna.student!, firstName: "Анна" }, at("20:00"))).toBeNull();
  });
});
