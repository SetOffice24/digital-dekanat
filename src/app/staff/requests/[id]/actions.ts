"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { assignToMe, changeRequestStatus } from "@/server/repos/staff";
import { AcademicError, recordRecredit, recordRetakeResultByStaff, scheduleRetake } from "@/server/services/academic";

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
  if (r === "needs_result") return { error: "Эту заявку выполняют через запись результата: назначьте пересдачу или внесите перезачёт" };
  if (r === "invalid") {
    revalidatePath(`/staff/requests/${id}`);
    return { error: "Статус заявки уже изменился — обновите страницу" };
  }
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

const refresh = (id: string) => {
  revalidatePath(`/staff/requests/${id}`);
  revalidatePath("/staff");
};

/** Назначить / перенести пересдачу (дата — по Москве). */
export async function scheduleRetakeAction(requestId: string, _: FormState, form: FormData): Promise<FormState> {
  const { staff } = await requireStaff();
  const p = z
    .object({ enrollmentId: z.string().min(1).max(40), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"), time: z.string().regex(/^\d{2}:\d{2}$/, "Укажите время"), room: z.string().trim().min(1, "Укажите аудиторию").max(60), teacherId: z.string().min(1, "Выберите преподавателя").max(40) })
    .safeParse(Object.fromEntries(["enrollmentId", "date", "time", "room", "teacherId"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    await scheduleRetake(staff, requestId, { enrollmentId: p.data.enrollmentId, startsAt: new Date(`${p.data.date}T${p.data.time}:00+03:00`), room: p.data.room, teacherId: p.data.teacherId });
  } catch (e) {
    if (e instanceof AcademicError) return { error: e.message };
    throw e;
  }
  refresh(requestId);
  return { ok: "Пересдача назначена — студент и преподаватель получили уведомления" };
}

/** Внести перезачтённую оценку и завершить заявку. */
export async function recordRecreditAction(requestId: string, _: FormState, form: FormData): Promise<FormState> {
  const { staff } = await requireStaff();
  const value = String(form.get("value") ?? "");
  if (!value) return { error: "Выберите оценку" };
  try {
    await recordRecredit(staff, requestId, value);
  } catch (e) {
    if (e instanceof AcademicError) return { error: e.message };
    throw e;
  }
  refresh(requestId);
  return { ok: "Перезачёт внесён в успеваемость, заявка выполнена" };
}

/** Результат пересдачи из ведомости (преподаватель без кабинета). */
export async function staffRetakeResultAction(requestId: string, examId: string, _: FormState, form: FormData): Promise<FormState> {
  const { staff } = await requireStaff();
  try {
    const passed = await recordRetakeResultByStaff(staff, examId, String(form.get("value") ?? ""));
    refresh(requestId);
    return { ok: passed ? "Результат внесён — задолженность закрыта" : "Результат внесён — задолженность осталась" };
  } catch (e) {
    if (e instanceof AcademicError) return { error: e.message };
    throw e;
  }
}
