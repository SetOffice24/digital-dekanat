"use server";
/**
 * Действия единого окна: деканат (документы, приём, отзыв справки, настройки услуг) и преподаватель (согласование перезачёта).
 * Кто действует и в какой области — только по сессии; репозитории ещё раз проверяют, что объект в этой области.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { decideApproval, revokeCertificate, ServiceError } from "@/server/services/requests";
import { DocumentError, reviewDocument } from "@/server/services/documents";
import { markAppointment } from "@/server/services/appointments";
import { SettingsError, updateServiceSettings } from "@/server/services/analytics";

export type SvcState = { error?: string; ok?: string };
const id = z.string().min(1).max(40);

async function staff() {
  const user = await getCurrentUser();
  return user?.role === "STAFF" && user.staff ? { id: user.staff.id, userId: user.id, facultyId: user.staff.facultyId } : null;
}

export async function decideApprovalAction(approvalId: string, decision: "APPROVED" | "REJECTED", comment: string): Promise<SvcState> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER" || !user.teacher) return { error: "Нет прав" };
  try {
    const ok = await decideApproval({ teacherId: user.teacher.id, userId: user.id }, id.parse(approvalId), decision === "APPROVED" ? "APPROVED" : "REJECTED", comment.slice(0, 500) || null);
    if (!ok) return { error: "Решение уже принято или заявка вам недоступна" };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  revalidatePath("/teacher");
  revalidatePath("/teacher/approvals");
  return { ok: decision === "APPROVED" ? "Согласовано — заявка ушла в деканат" : "Отклонено, студент получил уведомление" };
}

export async function reviewDocumentAction(docId: string, status: "VERIFIED" | "REJECTED", note: string, requestPath: string): Promise<SvcState> {
  const s = await staff();
  if (!s) return { error: "Нет прав" };
  try {
    const ok = await reviewDocument(s, id.parse(docId), status === "VERIFIED" ? "VERIFIED" : "REJECTED", note || null);
    if (!ok) return { error: "Документ недоступен" };
  } catch (e) {
    if (e instanceof DocumentError) return { error: e.message };
    throw e;
  }
  if (/^\/staff\/requests\/[\w-]+$/.test(requestPath)) revalidatePath(requestPath);
  return { ok: status === "VERIFIED" ? "Документ принят" : "Студент получит уведомление" };
}

export async function markAppointmentAction(apptId: string, status: "DONE" | "NO_SHOW") {
  const s = await staff();
  if (!s) return;
  await markAppointment(s, id.parse(apptId), status === "DONE" ? "DONE" : "NO_SHOW");
  revalidatePath("/staff/services/appointments");
}

export async function revokeCertificateAction(requestId: string, reason: string): Promise<SvcState> {
  const s = await staff();
  if (!s) return { error: "Отозвать справку может только деканат" };
  try {
    if (!(await revokeCertificate(s, id.parse(requestId), reason))) return { error: "Справка недоступна или уже отозвана" };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/staff/requests/${requestId}`);
  revalidatePath("/staff/services");
  return { ok: "Справка отозвана, студент получил уведомление" };
}

export async function updateServiceAction(typeId: string, _: SvcState, form: FormData): Promise<SvcState> {
  const s = await staff();
  if (!s) return { error: "Нет прав" };
  try {
    const ok = await updateServiceSettings(s, id.parse(typeId), { slaDays: Number(form.get("slaDays")), autoIssue: form.get("autoIssue") === "on", enabled: form.get("enabled") === "on" });
    if (!ok) return { error: "Услуга не найдена" };
  } catch (e) {
    if (e instanceof SettingsError) return { error: e.message };
    throw e;
  }
  revalidatePath("/staff/services");
  return { ok: "Сохранено" };
}
