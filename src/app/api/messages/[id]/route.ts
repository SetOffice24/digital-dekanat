import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { MessageError, replyToConversation, viewerOf } from "@/server/repos/messages";
import { UploadError } from "@/server/files";

export const runtime = "nodejs";

/** Ответить в диалоге. Чужой диалог — 404. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await ctx.params).id;
  if (!z.string().min(1).max(40).safeParse(id).success) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    await replyToConversation(viewerOf(user), id, { body: String(form.get("body") ?? "").slice(0, 5000), files });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MessageError) return NextResponse.json({ error: e.message }, { status: e.message === "Диалог не найден" ? 404 : 400 });
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
