"use server";
/** Единое окно студента: ситуации, документы, запись на приём, оценка услуги. Студент — только из сессии. */
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { DocKind } from "@prisma/client";
import { requireStudent } from "@/server/auth";
import { CaseError, closeCase, markRead, notifyTeachers, startCase } from "@/server/services/situations";
import { deleteDocument, DocumentError, uploadDocument } from "@/server/services/documents";
import { AppointmentError, bookAppointment, cancelAppointment } from "@/server/services/appointments";
import { rateRequest, ServiceError } from "@/server/services/requests";
import { docKinds } from "@/config/services";

export type ActState = { error?: string; ok?: string };

const id = z.string().min(1).max(40);

export async function startCaseAction(form: FormData) {
  const { student } = await requireStudent();
  const code = z.string().max(20).parse(form.get("code"));
  const c = await startCase(student, code);
  redirect(`/services/case/${c.id}`);
}

export async function markReadAction(caseId: string, key: string) {
  const { student } = await requireStudent();
  await markRead(student, id.parse(caseId), z.string().max(30).parse(key));
  revalidatePath(`/services/case/${caseId}`);
}

export async function notifyTeachersAction(caseId: string, _: ActState, form: FormData): Promise<ActState> {
  const { student } = await requireStudent();
  try {
    const n = await notifyTeachers(student, id.parse(caseId), String(form.get("from") ?? ""), String(form.get("to") ?? ""), String(form.get("note") ?? "").slice(0, 300));
    revalidatePath(`/services/case/${caseId}`);
    return { ok: n ? `Отправлено преподавателям: ${n}` : "У группы сейчас нет преподавателей в расписании" };
  } catch (e) {
    if (e instanceof CaseError) return { error: e.message };
    throw e;
  }
}

export async function closeCaseAction(caseId: string, status: "DONE" | "CANCELLED") {
  const { student } = await requireStudent();
  await closeCase(student, id.parse(caseId), status === "DONE" ? "DONE" : "CANCELLED");
  revalidatePath("/requests");
  redirect("/requests");
}

export async function uploadDocumentAction(_: ActState, form: FormData): Promise<ActState> {
  const { student } = await requireStudent();
  const kind = String(form.get("kind") ?? "") as DocKind;
  if (!(kind in docKinds)) return { error: "Выберите вид документа" };
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Выберите файл" };
  try {
    await uploadDocument(student, kind, file, String(form.get("validUntil") ?? "") || null);
  } catch (e) {
    if (e instanceof DocumentError) return { error: e.message };
    console.error("document upload", e);
    return { error: "Не удалось обработать файл — попробуйте другой" };
  }
  revalidatePath("/services/documents");
  const back = String(form.get("back") ?? "");
  if (back.startsWith("/services/case/") || back.startsWith("/requests/new")) redirect(back);
  return { ok: `${docKinds[kind].title} загружен. Деканат проверит его при первой заявке.` };
}

export async function deleteDocumentAction(docId: string): Promise<ActState> {
  const { student } = await requireStudent();
  try {
    await deleteDocument(student, id.parse(docId));
  } catch (e) {
    if (e instanceof DocumentError) return { error: e.message };
    throw e;
  }
  revalidatePath("/services/documents");
  return {};
}

export async function bookAppointmentAction(_: ActState, form: FormData): Promise<ActState> {
  const { student } = await requireStudent();
  try {
    await bookAppointment(student, String(form.get("startsAt") ?? ""), String(form.get("purpose") ?? ""), String(form.get("requestId") ?? "") || null);
  } catch (e) {
    if (e instanceof AppointmentError) return { error: e.message };
    throw e;
  }
  revalidatePath("/services/appointments");
  return { ok: "Записали! За час до приёма придёт напоминание." };
}

export async function cancelAppointmentAction(apptId: string) {
  const { student } = await requireStudent();
  await cancelAppointment(student, id.parse(apptId));
  revalidatePath("/services/appointments");
}

export async function rateRequestAction(requestId: string, _: ActState, form: FormData): Promise<ActState> {
  const { student } = await requireStudent();
  const rating = Number(form.get("rating"));
  try {
    const ok = await rateRequest(student, id.parse(requestId), rating, String(form.get("comment") ?? "") || null);
    if (!ok) return { error: "Оценку уже поставили" };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/requests/${requestId}`);
  return { ok: "Спасибо! Оценку увидит руководство деканата." };
}
