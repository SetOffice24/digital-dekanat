"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { createAnnouncement } from "@/server/repos/staff";
import { claimDraft, getDraftMessage, markDraftDone, releaseDraft } from "@/server/repos/assistant";

const schema = z.object({
  audience: z.enum(["ALL", "FACULTY", "GROUP"]),
  groupId: z.string().max(40),
  title: z.string().trim().min(3, "Заголовок — не короче 3 символов").max(120),
  body: z.string().trim().min(5, "Напишите текст объявления").max(3000),
});

/**
 * «Опубликовать» из карточки помощника. Только по нажатию сотрудника; проверки области — как у обычной формы
 * (группа своего факультета, «всем» — только сотруднику без факультета). Повторное нажатие не публикует второй раз.
 */
export async function announceFromDraftAction(messageId: string, values: { audience: "ALL" | "FACULTY" | "GROUP"; groupId: string; title: string; body: string }): Promise<{ ok?: { sentTo: number }; error?: string }> {
  const { user, staff } = await requireStaff();
  if (!z.string().min(1).max(40).safeParse(messageId).success) return { error: "Черновик не найден" };
  const msg = await getDraftMessage({ userId: user.id }, messageId);
  const draft = msg?.draft as { kind?: string; sentTo?: string } | null;
  if (draft?.kind !== "ANNOUNCEMENT") return { error: "Черновик не найден" };
  if (draft.sentTo) return { ok: { sentTo: Number(draft.sentTo) } };
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.audience === "GROUP" && !p.data.groupId) return { error: "Выберите группу" };
  if (!(await claimDraft({ userId: user.id }, messageId, "sentTo"))) return { error: "Объявление уже публикуется — обновите чат" };
  let sentTo: number | null;
  try {
    sentTo = await createAnnouncement(staff, { title: p.data.title, body: p.data.body, audience: p.data.audience, facultyId: staff.facultyId, groupId: p.data.groupId || null, pinned: false });
  } catch (e) {
    await releaseDraft({ userId: user.id }, messageId);
    throw e;
  }
  if (sentTo === null) {
    await releaseDraft({ userId: user.id }, messageId);
    return { error: "Эта аудитория вне вашей области" };
  }
  await markDraftDone({ userId: user.id }, messageId, { sentTo: String(sentTo) });
  revalidatePath("/staff/announcements");
  return { ok: { sentTo } };
}
