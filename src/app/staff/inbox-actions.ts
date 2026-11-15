"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { changeRequestStatus } from "@/server/repos/staff";

const schema = z.object({ id: z.string().min(1).max(40), to: z.enum(["IN_REVIEW", "READY", "DONE"]) });

/** Быстрое действие из списка «входящих»: взять в работу / справка готова / выдана. */
export async function quickStatusAction(id: string, to: "IN_REVIEW" | "READY" | "DONE") {
  const { staff } = await requireStaff();
  const p = schema.parse({ id, to });
  const msg = p.to === "READY" ? "Готово — можно скачать в заявке." : null;
  await changeRequestStatus(staff, p.id, p.to, msg);
  revalidatePath("/staff");
}
