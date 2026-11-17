/**
 * Демо-активность аккаунтов: даты последнего входа (большинство — на этой неделе, часть давно, несколько — ни разу),
 * один заблокированный, один с временным паролем, записи в журнале. Вызывается из seed.ts в конце.
 */
import type { PrismaClient } from "@prisma/client";

type Ctx = { prisma: PrismaClient; now: Date; annaId: string; petrId: string; annaGroupId: string; staffUserId: string; rng: () => number };

export async function seedAccounts(c: Ctx) {
  const { prisma, rng } = c;
  const hoursAgo = (h: number) => new Date(c.now.getTime() - h * 3600_000);
  const students = await prisma.student.findMany({ orderBy: [{ groupId: "asc" }, { lastName: "asc" }], select: { id: true, userId: true, groupId: true } });

  for (const s of students) {
    const r = rng();
    const last = s.id === c.annaId ? 1 : s.id === c.petrId ? 30 : r < 0.72 ? 1 + rng() * 6 * 24 : r < 0.9 ? (15 + rng() * 30) * 24 : null;
    await prisma.user.update({ where: { id: s.userId }, data: { lastLoginAt: last == null ? null : hoursAgo(last) } });
  }

  const mates = students.filter((s) => s.groupId === c.annaGroupId && s.id !== c.annaId);
  const ev = (studentId: string, action: "BLOCKED" | "PASSWORD_RESET" | "TRANSFERRED" | "CREATED", h: number, details?: string) =>
    prisma.accountEvent.create({ data: { studentId, actorUserId: c.staffUserId, action, details, createdAt: hoursAgo(h) } });

  // заблокирован: подозрение на чужой вход
  const blocked = mates[4];
  if (blocked) {
    await prisma.user.update({ where: { id: blocked.userId }, data: { blockedAt: hoursAgo(20), blockReason: "Подозрение на вход посторонних" } });
    await ev(blocked.id, "BLOCKED", 20, "Подозрение на вход посторонних");
  }
  // забыл пароль: выдан временный, ещё не вошёл
  const temp = mates[6];
  if (temp) {
    await prisma.user.update({ where: { id: temp.userId }, data: { mustChangePassword: true, lastLoginAt: hoursAgo(24 * 21) } });
    await ev(temp.id, "PASSWORD_RESET", 3);
  }
  // переведён из параллельной группы в начале семестра (только запись в журнале)
  const moved = mates[1];
  if (moved) await ev(moved.id, "TRANSFERRED", 24 * 40, "ИВТ-24-2, подгр. 1 → ИВТ-24-1, подгр. 2");
}
