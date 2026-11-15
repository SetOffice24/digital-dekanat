import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { sendPush } from "@/server/push";

/** Тестовое push-уведомление самому себе (кнопка в профиле). Лимит — раз в 30 секунд. */
const last = new Map<string, number>();
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Date.now() - (last.get(user.id) ?? 0) < 30_000) return NextResponse.json({ sent: 0, error: "Подождите полминуты" }, { status: 429 });
  last.set(user.id, Date.now());
  const r = await sendPush([user.id], { title: "Универ: уведомления работают", body: "Так будут приходить переносы пар и ответы деканата.", url: "/notifications" });
  return NextResponse.json(r);
}
