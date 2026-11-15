/**
 * Разделение данных: студент A не получает данные студента B ни через один репозиторий.
 * Требует засеянную БД (pnpm db:seed).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Student } from "@prisma/client";
import { answerRequest, getCertificateForStudent, getEnrollments, getLessons, getRequest, listNotifications, listRequests, markRead } from "@/server/repos/student";
import { buildStudentContext } from "@/server/ai/context";
import { addDays, mondayOf, moscowToday } from "@/lib/utils";

const db = new PrismaClient();
let anna: Student, petr: Student;

beforeAll(async () => {
  anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  petr = await db.student.findFirstOrThrow({ where: { user: { login: "petr.ozerov" } } });
});
afterAll(() => db.$disconnect());

describe("студент видит только свои данные", () => {
  it("заявки: список только свой, чужая по id — null", async () => {
    const list = await listRequests(anna);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((r) => r.studentId === anna.id)).toBe(true);
    const petrReq = await db.request.findFirstOrThrow({ where: { studentId: petr.id } });
    expect(await getRequest(anna, petrReq.id)).toBeNull();
    expect(await getRequest(petr, petrReq.id)).not.toBeNull();
  });

  it("нельзя ответить на чужую заявку", async () => {
    const petrNeedInfo = await db.request.findFirst({ where: { studentId: petr.id, status: "NEED_INFO" } });
    if (petrNeedInfo) expect(await answerRequest(anna, petrNeedInfo.id, "взлом")).toBeNull();
  });

  it("справка: чужую не скачать", async () => {
    const cert = await db.certificate.findFirstOrThrow({ where: { request: { studentId: anna.id } } });
    expect(await getCertificateForStudent(petr, cert.requestId)).toBeNull();
    expect(await getCertificateForStudent(anna, cert.requestId)).not.toBeNull();
  });

  it("оценки только свои", async () => {
    const e = await getEnrollments(anna);
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((x) => x.studentId === anna.id)).toBe(true);
  });

  it("расписание только своей группы и подгруппы", async () => {
    const from = mondayOf(moscowToday());
    const lessons = await getLessons(anna, from, addDays(from, 7));
    expect(lessons.every((l) => l.groupId === anna.groupId && (l.subgroup === null || l.subgroup === anna.subgroup))).toBe(true);
  });

  it("уведомления: чужие не видны и не отмечаются прочитанными", async () => {
    const mine = await listNotifications(anna.userId);
    expect(mine.every((n) => n.userId === anna.userId)).toBe(true);
    const petrNote = await db.notification.findFirstOrThrow({ where: { userId: petr.userId } });
    const res = await markRead(anna.userId, petrNote.id);
    expect(res.count).toBe(0);
  });

  it("контекст ИИ-помощника не содержит данных другого студента", async () => {
    const ctx = await buildStudentContext(anna);
    expect(ctx.text).toContain(anna.lastName);
    expect(ctx.text).not.toContain(petr.lastName);
    expect(ctx.text).not.toContain(petr.recordBookNo);
  });
});

describe("пароли", () => {
  it("хранятся только как хэш argon2id", async () => {
    const users = await db.user.findMany({ select: { passwordHash: true } });
    expect(users.every((u) => u.passwordHash.startsWith("$argon2id$"))).toBe(true);
    expect(users.some((u) => u.passwordHash.includes("Univer-2026"))).toBe(false);
  });
});
