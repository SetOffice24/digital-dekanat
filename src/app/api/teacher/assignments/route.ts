import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { createAssignment } from "@/server/repos/homework";
import { UploadError } from "@/server/files";
import { TeacherAccessError } from "@/server/repos/teacher";

export const runtime = "nodejs";

const schema = z.object({
  groupId: z.string().min(1).max(40),
  courseId: z.string().min(1).max(40),
  title: z.string().trim().min(2, "Название — не короче 2 символов").max(150),
  description: z.string().trim().min(5, "Опишите задание (хотя бы пару слов)").max(4000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите срок сдачи"),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).default("23:59"),
});

/** Выдать домашнее задание группе: срок, описание, файлы (по желанию). Студенты получают уведомление. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
  const parsed = schema.safeParse(Object.fromEntries(["groupId", "courseId", "title", "description", "dueDate", "dueTime"].map((k) => [k, form.get(k) ?? undefined])));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { groupId, courseId, title, description, dueDate, dueTime } = parsed.data;
  // срок — по Москве
  const dueAt = new Date(`${dueDate}T${dueTime}:00+03:00`);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now()) return NextResponse.json({ error: "Срок сдачи должен быть в будущем" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    await createAssignment(user.teacher, user.id, groupId, courseId, { title, description, dueAt }, files);
  } catch (e) {
    if (e instanceof UploadError || e instanceof TeacherAccessError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  revalidatePath(`/teacher/${groupId}/${courseId}/homework`);
  return NextResponse.json({ ok: true });
}
