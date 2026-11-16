import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { addMaterial } from "@/server/repos/homework";
import { UploadError } from "@/server/files";
import { TeacherAccessError } from "@/server/repos/teacher";

export const runtime = "nodejs";

const schema = z.object({
  groupId: z.string().min(1).max(40),
  courseId: z.string().min(1).max(40),
  title: z.string().trim().min(2, "Название — не короче 2 символов").max(150),
  description: z.string().trim().max(2000).optional(),
  url: z.union([z.literal(""), z.string().trim().url("Ссылка должна начинаться с http(s)://").max(500).refine((u) => /^https?:\/\//.test(u), "Ссылка должна начинаться с http(s)://")]).optional(),
});

/** Добавить материал (ссылка и/или файлы) группе по своей дисциплине. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
  const parsed = schema.safeParse({ groupId: form.get("groupId"), courseId: form.get("courseId"), title: form.get("title"), description: form.get("description") ?? undefined, url: form.get("url") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const { groupId, courseId, title, description, url } = parsed.data;
  if (!url && !files.length) return NextResponse.json({ error: "Добавьте ссылку или файл" }, { status: 400 });
  try {
    await addMaterial(user.teacher, user.id, groupId, courseId, { title, description: description || undefined, url: url || undefined }, files);
  } catch (e) {
    if (e instanceof UploadError || e instanceof TeacherAccessError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  revalidatePath(`/teacher/${groupId}/${courseId}/materials`);
  return NextResponse.json({ ok: true });
}
