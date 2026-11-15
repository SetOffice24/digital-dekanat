"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { assignToMe, changeRequestStatus } from "@/server/repos/staff";

export type FormState = { error?: string; ok?: string };

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(["IN_REVIEW", "NEED_INFO", "READY", "DONE", "REJECTED"], { error: "Выберите новый статус" }),
  message: z.string().trim().max(1000, "Комментарий не длиннее 1000 символов").optional(),
});

export async function changeStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const { staff } = await requireStaff();
  const parsed = schema.safeParse({ id: form.get("id"), status: form.get("status"), message: String(form.get("message") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, status, message } = parsed.data;
  if ((status === "NEED_INFO" || status === "REJECTED") && !message) {
    return { error: status === "NEED_INFO" ? "Напишите, что нужно уточнить у студента" : "Укажите причину отказа" };
  }
  const r = await changeRequestStatus(staff, id, status, message || null);
  if (!r) return { error: "Заявка не найдена" };
  revalidatePath(`/staff/requests/${id}`);
  revalidatePath("/staff/requests");
  revalidatePath("/staff");
  return { ok: "Статус изменён, студент получил уведомление" };
}

export async function assignAction(_: FormState, form: FormData): Promise<FormState> {
  const { staff } = await requireStaff();
  const id = z.string().min(1).safeParse(form.get("id"));
  if (!id.success) return { error: "Заявка не найдена" };
  if (!(await assignToMe(staff, id.data))) return { error: "Заявка не найдена" };
  revalidatePath(`/staff/requests/${id.data}`);
  revalidatePath("/staff/requests");
  return { ok: "Вы назначены исполнителем" };
}
