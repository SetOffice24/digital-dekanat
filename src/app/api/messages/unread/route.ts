import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { unreadConversations, viewerOf } from "@/server/repos/messages";

/** Сколько диалогов ждут внимания пользователя — для значка «Сообщения» в шапке. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ count: await unreadConversations(viewerOf(user)) }, { headers: { "Cache-Control": "no-store" } });
}
