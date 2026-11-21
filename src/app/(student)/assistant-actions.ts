"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/server/auth";
import { prisma } from "@/server/db";
import { createRequest } from "@/server/repos/student";
import { ServiceError } from "@/server/services/requests";
import { claimDraft, getDraftMessage, markDraftDone, markDraftOrdered, releaseDraft } from "@/server/repos/assistant";
import { parseFields, payloadSchema } from "@/lib/request-fields";

export type OrderResult = { ok?: { id: string; number: number }; error?: string; fieldErrors?: Record<string, string> };

/**
 * «Заказать» из карточки в чате помощника. Срабатывает только по нажатию студента.
 * Проверки те же, что у обычной формы; в один клик — только справки, заявления — через форму.
 */
export async function orderFromDraftAction(messageId: string, values: Record<string, string>, wantsPaper: boolean): Promise<OrderResult> {
  const { student } = await requireStudent();
  if (!z.string().min(1).max(40).safeParse(messageId).success) return { error: "Черновик не найден" };
  const msg = await getDraftMessage(student, messageId);
  const draft = msg?.draft as { typeCode?: string; requestId?: string } | null;
  if (!draft?.typeCode) return { error: "Черновик не найден" };
  if (draft.requestId) {
    const done = await prisma.request.findFirst({ where: { id: draft.requestId, studentId: student.id }, select: { id: true, number: true } });
    if (done) return { ok: done };
  }
  const type = await prisma.requestType.findUnique({ where: { code: draft.typeCode } });
  if (!type || !type.isCertificate) return { error: "Это заявление отправляется через форму" };
  const fields = parseFields(type.fields);
  const raw = Object.fromEntries(fields.map((f) => [f.name, String(values?.[f.name] ?? "").slice(0, 2000)]));
  const parsed = payloadSchema(fields).safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Заполните выделенные поля", fieldErrors };
  }
  if (!(await claimDraft(student, messageId, "requestId"))) return { error: "Заявка уже оформляется — обновите чат" };
  let r;
  try {
    r = await createRequest(student, type.id, parsed.data as Record<string, string>, Boolean(wantsPaper), "Заказано через помощника");
  } catch (e) {
    await releaseDraft(student, messageId);
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  await markDraftOrdered(student, messageId, r.id);
  revalidatePath("/requests");
  revalidatePath("/");
  return { ok: { id: r.id, number: r.number } };
}

/**
 * Карточка «Сдать задание» в чате: файлы уходят обычным путём (/api/homework/[id], те же проверки),
 * после этого карточка отмечается отправленной — только если сдача действительно есть.
 */
export async function markSubmissionSentAction(messageId: string, assignmentId: string): Promise<{ ok?: boolean }> {
  const { student } = await requireStudent();
  const ids = z.object({ m: z.string().min(1).max(40), a: z.string().min(1).max(40) }).safeParse({ m: messageId, a: assignmentId });
  if (!ids.success) return {};
  const msg = await getDraftMessage(student, ids.data.m);
  if ((msg?.draft as { kind?: string } | null)?.kind !== "SUBMISSION") return {};
  const sub = await prisma.submission.count({ where: { assignmentId: ids.data.a, studentId: student.id } });
  if (!sub) return {};
  await markDraftDone(student, ids.data.m, { sentAssignmentId: ids.data.a });
  return { ok: true };
}
