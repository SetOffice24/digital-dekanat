import "server-only";
import type { NotificationKind } from "@prisma/client";
import { prisma } from "./db";
import { sendPush } from "./push";

/** Создать уведомления пользователям. dedupeKey защищает от повторов (например, напоминаний о дедлайнах). */
export async function notify(userIds: string[], n: { kind: NotificationKind; title: string; body: string; link?: string; dedupeKey?: string }) {
  if (!userIds.length) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey })),
    skipDuplicates: true,
  });
  // и сразу push на устройства (телефон с установленным кабинетом, браузер с разрешением) — не дожидаясь ответа
  void sendPush(userIds, { title: n.title, body: n.body, url: n.link ?? "/notifications", tag: n.kind === "SCHEDULE_CHANGE" ? "schedule" : undefined }).catch(() => {});
}

/** userId студентов группы (опционально — подгруппы). */
export async function groupUserIds(groupId: string, subgroup?: number | null) {
  const students = await prisma.student.findMany({
    where: { groupId, ...(subgroup ? { subgroup } : {}) },
    select: { userId: true },
  });
  return students.map((s) => s.userId);
}

export async function audienceUserIds(a: { audience: "ALL" | "FACULTY" | "GROUP"; facultyId?: string | null; groupId?: string | null }) {
  const where = a.audience === "ALL" ? {} : a.audience === "FACULTY" ? { facultyId: a.facultyId! } : { groupId: a.groupId! };
  const students = await prisma.student.findMany({ where, select: { userId: true } });
  return students.map((s) => s.userId);
}

/** Напоминания о дедлайнах: за 3 дня и за 1 день. Вызывается при загрузке «Моего дня» (лениво, без крона). */
export async function remindDeadlines(student: { userId: string; facultyId: string; groupId: string }) {
  const now = new Date();
  const soon = await prisma.deadline.findMany({
    where: {
      dueAt: { gte: now, lt: new Date(now.getTime() + 3 * 86400000) },
      OR: [{ audience: "ALL" }, { audience: "FACULTY", facultyId: student.facultyId }, { audience: "GROUP", groupId: student.groupId }],
    },
  });
  for (const d of soon) {
    const hours = (d.dueAt.getTime() - now.getTime()) / 3600000;
    const days = Math.floor(hours / 24);
    const bucket = hours < 24 ? "1d" : "3d";
    await notify([student.userId], {
      kind: "DEADLINE",
      title: hours < 24 ? "Дедлайн меньше чем через сутки" : `Дедлайн через ${days} ${days === 1 ? "день" : "дня"}`,
      body: d.title,
      link: "/",
      dedupeKey: `deadline:${d.id}:${bucket}`,
    });
  }
}
