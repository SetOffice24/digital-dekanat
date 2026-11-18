import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { deleteChat, getChat } from "@/server/repos/assistant";
import { describeDraft } from "@/server/ai/drafts";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getChat({ userId: user.id }, (await params).id);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    {
      id: chat.id,
      title: chat.title,
      messages: await Promise.all(
        chat.messages.map(async (m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", text: m.content, draft: await describeDraft(m.draft, user), links: Array.isArray(m.links) ? m.links : [] })),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await deleteChat({ userId: user.id }, (await params).id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
