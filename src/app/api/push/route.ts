import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { removePushSubscription, savePushSubscription, vapidPublicKey } from "@/server/push";

const sub = z.object({ endpoint: z.string().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

/** Публичный ключ VAPID (нужен браузеру для подписки). null — push на сервере не настроен. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}

/** Подписать это устройство на уведомления текущего пользователя. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(await savePushSubscription(user.id, parsed.data, req.headers.get("user-agent")))) return NextResponse.json({ error: "Неверная подписка" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Отписать это устройство (только свою подписку). */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await removePushSubscription(user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
