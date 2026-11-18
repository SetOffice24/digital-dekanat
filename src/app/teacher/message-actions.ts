"use server";
import { z } from "zod";
import { requireTeacher } from "@/server/auth";
import { prisma } from "@/server/db";
import { notify } from "@/server/notify";
import { currentPeriod } from "@/server/repos/teacher";
import { MessageError, startConversation, viewerOf } from "@/server/repos/messages";
import { getDraftMessage, markDraftDone } from "@/server/repos/assistant";

const schema = z.object({
  mode: z.enum(["STUDENT", "GROUP"]),
  studentUserId: z.string().max(40),
  groupId: z.string().max(40),
  subject: z.string().trim().min(2, "Укажите тему").max(150),
  body: z.string().trim().min(3, "Напишите текст").max(4000),
});

/**
 * «Отправить» из карточки помощника преподавателя. Только по нажатию.
 * Студенту — личный диалог (те же правила, что в «Сообщениях»: только студенты своих групп);
 * группе — уведомление всем студентам группы (групповых чатов нет — решение команды). Повтор не отправляет второй раз.
 */
export async function sendFromDraftAction(messageId: string, values: z.input<typeof schema>): Promise<{ ok?: { href?: string; sentTo?: number }; error?: string }> {
  const { user, teacher } = await requireTeacher();
  if (!z.string().min(1).max(40).safeParse(messageId).success) return { error: "Черновик не найден" };
  const msg = await getDraftMessage({ userId: user.id }, messageId);
  const draft = msg?.draft as { kind?: string; conversationId?: string; sentTo?: string } | null;
  if (draft?.kind !== "MESSAGE") return { error: "Черновик не найден" };
  if (draft.conversationId) return { ok: { href: `/teacher/messages/${draft.conversationId}` } };
  if (draft.sentTo) return { ok: { sentTo: Number(draft.sentTo) } };
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message };
  const v = p.data;

  if (v.mode === "STUDENT") {
    if (!v.studentUserId) return { error: "Выберите студента" };
    try {
      // ключ из id сообщения помощника — повторное нажатие не создаст второй диалог
      const c = await startConversation(viewerOf(user), { to: v.studentUserId, subject: v.subject, body: v.body, files: [], clientKey: `ai-${messageId}` });
      await markDraftDone({ userId: user.id }, messageId, { conversationId: c.id });
      return { ok: { href: `/teacher/messages/${c.id}` } };
    } catch (e) {
      if (e instanceof MessageError) return { error: e.message };
      throw e;
    }
  }

  if (!v.groupId) return { error: "Выберите группу" };
  const teaches = await prisma.lesson.count({ where: { teacherId: teacher.id, groupId: v.groupId, ...currentPeriod() } });
  if (!teaches) return { error: "Это не ваша группа" };
  const students = await prisma.student.findMany({ where: { groupId: v.groupId, user: { blockedAt: null } }, select: { userId: true } });
  await notify(students.map((s) => s.userId), { kind: "SYSTEM", title: `${v.subject} · ${teacher.fullName}`, body: v.body, link: "/homework", dedupeKey: `teacher-note:${messageId}` });
  await markDraftDone({ userId: user.id }, messageId, { sentTo: String(students.length) });
  return { ok: { sentTo: students.length } };
}
