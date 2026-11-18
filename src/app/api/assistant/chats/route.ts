import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { listChats } from "@/server/repos/assistant";

/** История чатов помощника — свои (любая роль). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ chats: await listChats({ userId: user.id }) }, { headers: { "Cache-Control": "no-store" } });
}
