"use server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { fromMoscow } from "@/server/reminders";
import { claimDraft, getDraftMessage, markDraftDone, releaseDraft } from "@/server/repos/assistant";
import { fmtDateTime } from "@/lib/utils";

const schema = z.object({
  text: z.string().trim().min(2, "Напишите, о чём напомнить").max(200),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Укажите дату и время"),
});

/** «Поставить напоминание» из карточки помощника (любая роль). Только по нажатию; повтор не создаёт второе. */
export async function createReminderAction(messageId: string, values: { text: string; dueAt: string }): Promise<{ ok?: { when: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Войдите заново" };
  if (!z.string().min(1).max(40).safeParse(messageId).success) return { error: "Черновик не найден" };
  const msg = await getDraftMessage({ userId: user.id }, messageId);
  const draft = msg?.draft as { kind?: string; reminderWhen?: string } | null;
  if (draft?.kind !== "REMINDER") return { error: "Черновик не найден" };
  if (draft.reminderWhen) return { ok: { when: draft.reminderWhen } };
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message };
  const dueAt = fromMoscow(p.data.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now() - 60_000) return { error: "Это время уже прошло" };
  if (dueAt.getTime() > Date.now() + 366 * 86400_000) return { error: "Не дальше чем через год" };
  if ((await prisma.reminder.count({ where: { userId: user.id, sentAt: null } })) >= 50) return { error: "Слишком много активных напоминаний — удалите ненужные" };
  const owner = { userId: user.id };
  if (!(await claimDraft(owner, messageId, "reminderWhen"))) return { error: "Напоминание уже ставится — обновите чат" };
  const when = fmtDateTime(dueAt);
  try {
    await prisma.reminder.create({ data: { userId: user.id, text: p.data.text, dueAt } });
  } catch (e) {
    await releaseDraft(owner, messageId);
    throw e;
  }
  await markDraftDone(owner, messageId, { reminderWhen: when });
  return { ok: { when } };
}

/** Удалить своё напоминание. */
export async function deleteReminderAction(id: string): Promise<{ ok?: boolean }> {
  const user = await getCurrentUser();
  if (!user || !z.string().min(1).max(40).safeParse(id).success) return {};
  await prisma.reminder.deleteMany({ where: { id, userId: user.id, sentAt: null } });
  return { ok: true };
}
