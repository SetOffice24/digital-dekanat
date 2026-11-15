import { NextResponse } from "next/server";
import { apiStudent } from "@/server/auth";
import { deleteChat, getChat } from "@/server/repos/assistant";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getChat(auth.student, (await params).id);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    {
      id: chat.id,
      title: chat.title,
      messages: chat.messages.map((m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", text: m.content, draft: m.draft ?? null })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await deleteChat(auth.student, (await params).id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
