import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { unreadCount } from "@/server/repos/student";
import { deliverDueReminders } from "@/server/reminders";

/** Счётчик непрочитанных + самое свежее непрочитанное — для всплывающего извещения. Только свои. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // напоминания этого пользователя, если фоновый таймер ещё не успел
  await deliverDueReminders(user.id).catch(() => 0);
  const [count, latest] = await Promise.all([
    unreadCount(user.id),
    prisma.notification.findFirst({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, body: true, link: true, createdAt: true } }),
  ]);
  return NextResponse.json({ count, latest }, { headers: { "Cache-Control": "no-store" } });
}
