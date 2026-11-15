"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { cancelLesson, moveLesson } from "@/server/repos/staff";
import { bells } from "@/config/university";
import { parseIsoDate } from "@/lib/utils";

export type SchedState = { error?: string; ok?: string };

const reason = z.string().trim().min(3, "Укажите причину (не короче 3 символов)").max(300, "Причина — не длиннее 300 символов");

const moveSchema = z.object({
  id: z.string().min(1),
  date: z.string().refine((s) => parseIsoDate(s) !== null, "Укажите дату переноса"),
  bell: z.string().refine((s) => bells.some((b) => `${b.start}|${b.end}` === s), "Выберите пару"),
  room: z.string().trim().min(1, "Укажите аудиторию").max(20, "Аудитория — не длиннее 20 символов"),
  reason,
});

export async function moveLessonAction(_: SchedState, form: FormData): Promise<SchedState> {
  const { staff } = await requireStaff();
  const parsed = moveSchema.safeParse(Object.fromEntries(["id", "date", "bell", "room", "reason"].map((k) => [k, form.get(k) ?? ""])));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const [startTime, endTime] = v.bell.split("|");
  const l = await moveLesson(staff, v.id, { date: parseIsoDate(v.date)!, startTime, endTime, room: v.room, reason: v.reason });
  if (!l) return { error: "Занятие не найдено или уже отменено" };
  revalidatePath("/staff/schedule");
  return { ok: "Занятие перенесено, студенты получили уведомление" };
}

export async function cancelLessonAction(_: SchedState, form: FormData): Promise<SchedState> {
  const { staff } = await requireStaff();
  const parsed = z.object({ id: z.string().min(1), reason }).safeParse({ id: form.get("id") ?? "", reason: form.get("reason") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const l = await cancelLesson(staff, parsed.data.id, parsed.data.reason);
  if (!l) return { error: "Занятие не найдено или уже отменено" };
  revalidatePath("/staff/schedule");
  return { ok: "Занятие отменено, студенты получили уведомление" };
}
