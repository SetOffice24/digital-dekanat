import { NextResponse } from "next/server";
import { apiStudent } from "@/server/auth";
import { listChats } from "@/server/repos/assistant";

export async function GET() {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ chats: await listChats(auth.student) }, { headers: { "Cache-Control": "no-store" } });
}
