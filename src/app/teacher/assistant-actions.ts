"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { createAssignment } from "@/server/repos/homework";
import { TeacherAccessError } from "@/server/repos/teacher";
import { claimDraft, getDraftMessage, markDraftDone, releaseDraft } from "@/server/repos/assistant";
import { prisma } from "@/server/db";

const schema = z.object({
  pair: z.string().regex(/^[^|]{1,40}\|[^|]{1,40}$/, "Выберите группу и дисциплину"),
  title: z.string().trim().min(2, "Название — не короче 2 символов").max(150),
  description: z.string().trim().min(5, "Опишите задание (хотя бы пару слов)").max(4000),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Укажите срок сдачи"),
});

/**
 * «Выдать» из карточки помощника. Срабатывает только по нажатию преподавателя; проверки — те же, что у обычной формы
 * (только свои пары, срок в будущем). Студенты получают уведомление как обычно; повторное нажатие не создаёт второе задание.
 */
export async function assignFromDraftAction(messageId: string, values: { pair: string; title: string; description: string; dueAt: string }): Promise<{ ok?: { href: string; title: string }; error?: string }> {
  const { user, teacher } = await requireTeacher();
  if (!z.string().min(1).max(40).safeParse(messageId).success) return { error: "Черновик не найден" };
  const msg = await getDraftMessage({ userId: user.id }, messageId);
  const draft = msg?.draft as { kind?: string; assignmentId?: string } | null;
  if (draft?.kind !== "ASSIGNMENT") return { error: "Черновик не найден" };
  if (draft.assignmentId) {
    const a = await prisma.assignment.findFirst({ where: { id: draft.assignmentId, teacherId: teacher.id }, select: { id: true, title: true, groupId: true, courseId: true } });
    if (a) return { ok: { href: `/teacher/${a.groupId}/${a.courseId}/homework/${a.id}`, title: a.title } };
  }
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message };
  const [groupId, courseId] = p.data.pair.split("|");
  const dueAt = new Date(`${p.data.dueAt}:00+03:00`); // срок — по Москве
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now()) return { error: "Срок сдачи должен быть в будущем" };
  if (!(await claimDraft({ userId: user.id }, messageId, "assignmentId"))) return { error: "Задание уже выдаётся — обновите чат" };
  try {
    const a = await createAssignment(teacher, user.id, groupId, courseId, { title: p.data.title, description: p.data.description, dueAt }, []);
    await markDraftDone({ userId: user.id }, messageId, { assignmentId: a.id });
    revalidatePath(`/teacher/${groupId}/${courseId}/homework`);
    return { ok: { href: `/teacher/${groupId}/${courseId}/homework/${a.id}`, title: a.title } };
  } catch (e) {
    await releaseDraft({ userId: user.id }, messageId);
    if (e instanceof TeacherAccessError) return { error: e.message };
    throw e;
  }
}
