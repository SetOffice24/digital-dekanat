import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { apiStudent } from "@/server/auth";
import { HomeworkError, submitHomework } from "@/server/repos/homework";
import { UploadError } from "@/server/files";

export const runtime = "nodejs";

/** Студент отправляет выполненное задание: файлы + комментарий. Только задания своей группы. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await ctx.params).id;
  if (!z.string().min(1).max(40).safeParse(id).success) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
  const comment = z.string().trim().max(1000).safeParse(String(form.get("comment") ?? ""));
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    await submitHomework(auth.student, id, comment.success && comment.data ? comment.data : null, files);
  } catch (e) {
    if (e instanceof UploadError || e instanceof HomeworkError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  revalidatePath(`/homework/${id}`);
  revalidatePath("/homework");
  return NextResponse.json({ ok: true });
}
