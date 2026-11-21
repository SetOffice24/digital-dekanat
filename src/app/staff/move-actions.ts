"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { cancelLesson, moveLesson } from "@/server/repos/staff";
import { getDraftMessage, markDraftDone } from "@/server/repos/assistant";
import { bells } from "@/config/university";
import { parseIsoDate } from "@/lib/utils";

const schema = z.object({
  lessonId: z.string().min(1, "Выберите пару").max(40),
  date: z.string().refine((s) => parseIsoDate(s) !== null, "Укажите новую дату"),
  bell: z.string().refine((s) => bells.some((b) => `${b.start}|${b.end}` === s), "Выберите время по звонкам"),
  room: z.string().trim().min(1, "Укажите аудиторию").max(20),
  reason: z.string().trim().min(3, "Укажите причину — её увидят студенты").max(300),
});

/**
 * «Перенести» из карточки помощника деканата. Только по нажатию; та же функция, что на странице расписания
 * (пара своего факультета, не отменённая) — студенты получают уведомление. Повтор не переносит второй раз.
 */
export async function moveFromDraftAction(messageId: string, values: z.input<typeof schema>): Promise<{ ok?: { text: string }; error?: string }> {
  const { user, staff } = await requireStaff();
  if (!z.string().min(1).max(40).safeParse(messageId).success) return { error: "Черновик не найден" };
  const msg = await getDraftMessage({ userId: user.id }, messageId);
  const draft = msg?.draft as { kind?: string; movedText?: string } | null;
  if (draft?.kind !== "MOVE") return { error: "Черновик не найден" };
  if (draft.movedText) return { ok: { text: draft.movedText } };
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message };
  const date = parseIsoDate(p.data.date)!;
  if (date.getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime()) return { error: "Новая дата уже прошла" };
  const [startTime, endTime] = p.data.bell.split("|");
  const l = await moveLesson(staff, p.data.lessonId, { date, startTime, endTime, room: p.data.room, reason: p.data.reason });
  if (l === "unchanged") return { error: "Дата, время и аудитория те же — переносить нечего" };
  if (!l) return { error: "Пара не найдена или уже отменена" };
  const text = `${l.course.name} перенесена на ${p.data.date.split("-").reverse().join(".")}, ${startTime}, ауд. ${p.data.room}`;
  await markDraftDone({ userId: user.id }, messageId, { movedText: text });
  revalidatePath("/staff/schedule");
  return { ok: { text } };
}

/** Отменить пару из мини-раздела «Расписание группы» в чате. Та же функция, что на странице расписания; причина обязательна. */
export async function cancelFromChatAction(lessonId: string, reason: string): Promise<{ ok?: boolean; error?: string }> {
  const { staff } = await requireStaff();
  const p = z.object({ id: z.string().min(1).max(40), reason: z.string().trim().min(3, "Укажите причину — её увидят студенты").max(300) }).safeParse({ id: lessonId, reason });
  if (!p.success) return { error: p.error.issues[0].message };
  const l = await cancelLesson(staff, p.data.id, p.data.reason);
  if (!l) return { error: "Пара не найдена или уже отменена" };
  revalidatePath("/staff/schedule");
  return { ok: true };
}
