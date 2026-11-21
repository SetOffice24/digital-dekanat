import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { deleteChat, getChat } from "@/server/repos/assistant";
import { describeDraft } from "@/server/ai/drafts";
import { prisma } from "@/server/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getChat({ userId: user.id }, (await params).id);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // открыл — сообщение помощника «сам» прочитано (гасим точку на кнопке)
  await prisma.aiChat.update({ where: { id: chat.id }, data: { seenAt: new Date() } });
  return NextResponse.json(
    {
      id: chat.id,
      title: chat.title,
      messages: await Promise.all(
        chat.messages.map(async (m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", text: m.content, draft: await describeDraft(m.draft, user), links: Array.isArray(m.links) ? m.links : [], widget: m.widget ?? null, suggestions: Array.isArray(m.suggestions) ? m.suggestions : [], proactive: m.proactive })),
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
