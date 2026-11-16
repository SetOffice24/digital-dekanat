"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { reviewSubmission } from "@/server/repos/homework";

/** Принять сдачу или вернуть на доработку (тогда комментарий обязателен). Студент получает уведомление. */
export async function reviewAction(submissionId: string, status: "ACCEPTED" | "RETURNED", comment: string): Promise<{ ok?: boolean; error?: string }> {
  const { teacher } = await requireTeacher();
  const p = z.object({ id: z.string().min(1).max(40), status: z.enum(["ACCEPTED", "RETURNED"]), comment: z.string().trim().max(1000) }).safeParse({ id: submissionId, status, comment });
  if (!p.success) return { error: "Не удалось сохранить" };
  if (p.data.status === "RETURNED" && p.data.comment.length < 3) return { error: "Напишите, что исправить" };
  const r = await reviewSubmission(teacher, p.data.id, p.data.status, p.data.comment || null);
  if (!r) return { error: "Сдача не найдена" };
  revalidatePath("/teacher/[groupId]/[courseId]/homework", "layout");
  return { ok: true };
}
