import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { unreadCount } from "@/server/repos/student";
import { deliverDueReminders } from "@/server/reminders";
import { deliverStudentDigest, unseenProactive } from "@/server/proactive";

/**
 * Счётчик непрочитанных + самое свежее непрочитанное — для всплывающего извещения. Только свои.
 * Для студента — ещё и сообщение помощника «сам» (если фоновый обход до него не дошёл) и точка на кнопке помощника.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // напоминания этого пользователя, если фоновый таймер ещё не успел
  await deliverDueReminders(user.id).catch(() => 0);
  if (user.student) await deliverStudentDigest(user.student).catch((e) => console.error("digest", e));
  const [count, latest, assistantChat] = await Promise.all([
    unreadCount(user.id),
    prisma.notification.findFirst({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, body: true, link: true, createdAt: true } }),
    user.student ? unseenProactive(user.id) : Promise.resolve(null),
  ]);
  return NextResponse.json({ count, latest, assistantChat }, { headers: { "Cache-Control": "no-store" } });
}
