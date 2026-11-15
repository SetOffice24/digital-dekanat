"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { addGradesBulk, MAX_POINTS, WORK_KINDS } from "@/server/repos/teacher";

export type BulkState = { error?: string; values?: Record<string, string>; note?: string };

const ID = z.string().min(1).max(40);

/** Оценки всей группе за одну работу: поля `p_<enrollmentId>`, пустые пропускаем. */
export async function bulkGradesAction(_: BulkState, form: FormData): Promise<BulkState> {
  const { teacher } = await requireTeacher();
  const groupId = ID.safeParse(form.get("groupId"));
  const courseId = ID.safeParse(form.get("courseId"));
  const note = z.enum(WORK_KINDS).safeParse(form.get("note"));
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("p_")) values[k.slice(2)] = String(v).trim();
  const keep = { values, note: note.success ? note.data : undefined };
  if (!groupId.success || !courseId.success) return { error: "Группа не найдена", ...keep };
  if (!note.success) return { error: "Выберите вид работы", ...keep };

  const items: { enrollmentId: string; points: number }[] = [];
  for (const [id, raw] of Object.entries(values)) {
    if (raw === "") continue;
    const n = Number(raw);
    if (!ID.safeParse(id).success || !Number.isInteger(n) || n < 0 || n > MAX_POINTS) return { error: `Баллы — целое число от 0 до ${MAX_POINTS}. Проверьте подсвеченные поля.`, ...keep };
    items.push({ enrollmentId: id, points: n });
  }
  if (!items.length) return { error: "Впишите баллы хотя бы одному студенту", ...keep };

  try {
    await addGradesBulk(teacher, groupId.data, courseId.data, note.data, items);
  } catch {
    return { error: "Не удалось сохранить: нет доступа к этой группе", ...keep };
  }
  revalidatePath("/teacher/[groupId]/[courseId]", "page");
  redirect(`/teacher/${groupId.data}/${courseId.data}?saved=${items.length}`);
}
