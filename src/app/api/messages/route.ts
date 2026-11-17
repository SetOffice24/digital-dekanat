import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { MessageError, startConversation, viewerOf } from "@/server/repos/messages";
import { UploadError } from "@/server/files";

export const runtime = "nodejs";

const schema = z.object({
  to: z.string().min(1).max(40),
  subject: z.string().max(150),
  body: z.string().max(4000),
  contextType: z.enum(["REQUEST", "COURSE", "ASSIGNMENT"]).optional(),
  contextId: z.string().max(40).optional(),
});

/** Начать новый диалог (текст + файлы Word/PDF/Excel/PowerPoint). Права проверяет репозиторий. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
  const parsed = schema.safeParse({
    to: form.get("to"),
    subject: String(form.get("subject") ?? ""),
    body: String(form.get("body") ?? ""),
    contextType: form.get("contextType") || undefined,
    contextId: form.get("contextId") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Проверьте поля сообщения" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const { to, subject, body, contextType, contextId } = parsed.data;
  try {
    const c = await startConversation(viewerOf(user), { to, subject, body, files, context: contextType && contextId ? { type: contextType, id: contextId } : null });
    return NextResponse.json({ id: c.id });
  } catch (e) {
    if (e instanceof MessageError || e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
