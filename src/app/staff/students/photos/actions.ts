"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { reviewPhoto } from "@/server/repos/photos";

const schema = z.object({ id: z.string().min(1).max(40), decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().max(300) });

/** Принять фото или отклонить с причиной (её увидит студент). */
export async function reviewPhotoAction(id: string, decision: "APPROVED" | "REJECTED", comment: string): Promise<{ ok?: boolean; error?: string }> {
  const { staff } = await requireStaff();
  const p = schema.safeParse({ id, decision, comment });
  if (!p.success) return { error: "Не удалось сохранить" };
  if (p.data.decision === "REJECTED" && p.data.comment.length < 3) return { error: "Укажите причину — студент увидит её" };
  const ok = await reviewPhoto(staff, p.data.id, p.data.decision, p.data.decision === "REJECTED" ? p.data.comment : null);
  revalidatePath("/staff/students", "layout");
  return ok ? { ok: true } : { error: "Фото уже проверено или не найдено — обновите страницу" };
}
