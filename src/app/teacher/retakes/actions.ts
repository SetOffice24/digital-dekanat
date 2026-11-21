"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { AcademicError, recordRetakeResult } from "@/server/services/academic";

/** Результат пересдачи: оценка закрывает (или нет) долг студента, заявка выполняется, деканат получает уведомление. */
export async function recordRetakeAction(examId: string, _: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const { user, teacher } = await requireTeacher();
  if (!z.string().min(1).max(40).safeParse(examId).success) return { error: "Пересдача не найдена" };
  const value = String(form.get("value") ?? "");
  try {
    const passed = await recordRetakeResult({ id: teacher.id, userId: user.id }, examId, value);
    revalidatePath("/teacher/retakes");
    revalidatePath("/teacher");
    return { ok: passed ? "Результат внесён — задолженность закрыта" : "Результат внесён — задолженность осталась" };
  } catch (e) {
    if (e instanceof AcademicError) return { error: e.message };
    throw e;
  }
}
