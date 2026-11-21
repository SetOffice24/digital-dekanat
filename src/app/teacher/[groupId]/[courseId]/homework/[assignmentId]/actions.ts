"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { HomeworkError, reviewSubmission } from "@/server/repos/homework";
import { MAX_POINTS } from "@/server/repos/teacher";

/** Принять сдачу или вернуть на доработку (тогда комментарий обязателен). Студент получает уведомление. */
export async function reviewAction(submissionId: string, version: number, status: "ACCEPTED" | "RETURNED", comment: string, points: number | null = null): Promise<{ ok?: boolean; error?: string }> {
  const { teacher } = await requireTeacher();
  const p = z
    .object({ id: z.string().min(1).max(40), version: z.number().int().min(1), status: z.enum(["ACCEPTED", "RETURNED"]), comment: z.string().trim().max(1000), points: z.number().int().min(0).max(MAX_POINTS).nullable() })
    .safeParse({ id: submissionId, version, status, comment, points });
  if (!p.success) return { error: `Баллы — целое число от 0 до ${MAX_POINTS}` };
  if (p.data.status === "RETURNED" && p.data.comment.length < 3) return { error: "Напишите, что исправить" };
  let r;
  try {
    r = await reviewSubmission(teacher, p.data.id, p.data.version, p.data.status, p.data.comment || null, p.data.points);
  } catch (e) {
    if (e instanceof HomeworkError) return { error: e.message };
    throw e;
  }
  if (r === null) return { error: "Сдача не найдена" };
  if (r === "stale") {
    revalidatePath("/teacher/[groupId]/[courseId]/homework", "layout");
    return { error: "Студент уже прислал новую версию — обновите страницу и проверьте её" };
  }
  revalidatePath("/teacher/[groupId]/[courseId]/homework", "layout");
  revalidatePath("/teacher/[groupId]/[courseId]", "page");
  return { ok: true };
}
