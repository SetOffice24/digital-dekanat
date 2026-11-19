import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { deliverDueReminders } from "@/server/reminders";

/** Последнее сработавшее напоминание (за 15 минут) — для всплывающей карточки у преподавателя и деканата. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deliverDueReminders(user.id).catch(() => 0);
  const r = await prisma.reminder.findFirst({ where: { userId: user.id, sentAt: { gte: new Date(Date.now() - 15 * 60_000) } }, orderBy: { sentAt: "desc" }, select: { id: true, text: true } });
  return NextResponse.json({ latest: r }, { headers: { "Cache-Control": "no-store" } });
}
