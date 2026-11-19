"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { changeRequestStatus } from "@/server/repos/staff";

const schema = z.object({ id: z.string().min(1).max(40), to: z.enum(["IN_REVIEW", "READY", "DONE"]) });

/** Быстрое действие из списка «входящих»: взять в работу / справка готова / выдана. */
export async function quickStatusAction(id: string, to: "IN_REVIEW" | "READY" | "DONE") {
  const { staff } = await requireStaff();
  const parsed = schema.safeParse({ id, to });
  if (!parsed.success) return;
  const p = parsed.data;
  const msg = p.to === "READY" ? "Готово — можно скачать в заявке." : null;
  await changeRequestStatus(staff, p.id, p.to, msg);
  revalidatePath("/staff");
}

const bulkSchema = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(50), to: z.enum(["IN_REVIEW", "DONE"]) });

/**
 * Массовое действие во «входящих»: взять в работу несколько новых или отметить выданными несколько готовых.
 * Каждая заявка проходит те же проверки, что и по одной (область, допустимый переход); неподходящие пропускаются.
 */
export async function bulkStatusAction(ids: string[], to: "IN_REVIEW" | "DONE"): Promise<{ done: number; skipped: number }> {
  const { staff } = await requireStaff();
  const p = bulkSchema.safeParse({ ids: [...new Set(ids)], to });
  if (!p.success) return { done: 0, skipped: ids.length };
  let done = 0;
  for (const id of p.data.ids) {
    const r = await changeRequestStatus(staff, id, p.data.to, null);
    if (r && r !== "invalid") done++;
  }
  revalidatePath("/staff");
  return { done, skipped: p.data.ids.length - done };
}
