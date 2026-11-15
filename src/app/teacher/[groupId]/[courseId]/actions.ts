"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { addGrade, deleteGrade, MAX_POINTS, WORK_KINDS } from "@/server/repos/teacher";

export type GradeState = { error?: string; ok?: string; t?: number };

const schema = z.object({
  enrollmentId: z.string().min(1),
  points: z.coerce.number({ error: "Введите баллы числом" }).int("Баллы — целое число").min(0, "Баллы не могут быть меньше 0").max(MAX_POINTS, `Максимум — ${MAX_POINTS} баллов`),
  note: z.enum(WORK_KINDS, { error: "Выберите вид работы" }),
});

export async function addGradeAction(_: GradeState, form: FormData): Promise<GradeState> {
  const { teacher } = await requireTeacher();
  const raw = String(form.get("points") ?? "").trim();
  if (!raw) return { error: `Введите баллы от 0 до ${MAX_POINTS}` };
  const parsed = schema.safeParse({ enrollmentId: form.get("enrollmentId"), points: raw, note: form.get("note") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await addGrade(teacher, parsed.data.enrollmentId, parsed.data.points, parsed.data.note);
  } catch {
    return { error: "Не удалось поставить оценку: нет доступа к этому студенту" };
  }
  revalidatePath("/teacher/[groupId]/[courseId]", "page");
  return { ok: "Оценка поставлена, студент получил уведомление", t: Date.now() };
}

export async function deleteGradeAction(gradeId: string): Promise<{ error?: string }> {
  const { teacher } = await requireTeacher();
  const ok = await deleteGrade(teacher, gradeId);
  if (!ok) return { error: "Эту оценку удалить нельзя" };
  revalidatePath("/teacher/[groupId]/[courseId]", "page");
  return {};
}
