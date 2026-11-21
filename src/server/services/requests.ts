import "server-only";
/**
 * Единое окно: как заявка проходит путь. Все услуги выполняет деканат.
 * 1. Студент подаёт любую услугу в одном месте (submitRequest) — документы из «Моих документов» прикладываются,
 *    срок считается по регламенту (рабочие дни), заявка может быть частью жизненной ситуации.
 * 2. Если у услуги есть согласование (перезачёт) — сначала решает преподаватель дисциплины; отказ отклоняет заявку,
 *    «согласовано» передаёт её деканату.
 * 3. Услуги с автовыдачей (справка об обучении) готовы сразу: данные уже есть в системе. Деканат видит их в журнале и может отозвать.
 * 4. Просрочка срока — руководителю (escalateOverdue), после завершения студент ставит оценку.
 */
import { customAlphabet } from "nanoid";
import type { DocKind, Prisma, RequestType, Student } from "@prisma/client";
import { prisma } from "../db";
import { notify } from "../notify";
import { currentPeriod } from "../repos/teacher";
import { studentScope, type SessionStaff } from "../repos/staff";
import { isUsable } from "./documents";
import { addDays, dueDate } from "@/lib/utils";

const verifyCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

export class ServiceError extends Error {}

export type DocReq = { kind: DocKind; required: boolean };
/** Шаг согласования до деканата: преподаватель дисциплины из поля «course». */
export type RouteStep = { kind: "TEACHER" };

export const typeDocs = (t: Pick<RequestType, "docs">): DocReq[] => (Array.isArray(t.docs) ? (t.docs as DocReq[]) : []);
export const typeRoute = (t: Pick<RequestType, "route">): RouteStep[] => (Array.isArray(t.route) ? (t.route as RouteStep[]).filter((s) => s?.kind === "TEACHER") : []);

/** Подпись шага согласования. */
export const stepLabel = (a: { teacher?: { fullName: string } | null }) => `Преподаватель${a.teacher ? ` ${a.teacher.fullName}` : ""}`;

type SubmitStudent = Pick<Student, "id" | "userId" | "groupId" | "facultyId">;
export type SubmitOptions = { wantsPaper?: boolean; comment?: string; docIds?: string[]; caseId?: string | null };

/** Сотрудники деканата, которые видят заявку студента: его факультета и деканат вуза. */
export async function deaneryUserIds(facultyId: string) {
  return (await prisma.staff.findMany({ where: { OR: [{ facultyId: null }, { facultyId }] }, select: { userId: true } })).map((s) => s.userId);
}

/** Преподаватель дисциплины для студента — по расписанию его группы в текущем периоде. */
async function teacherFor(student: SubmitStudent, courseName: string) {
  const l = await prisma.lesson.findFirst({ where: { groupId: student.groupId, course: { name: courseName }, ...currentPeriod() }, select: { teacherId: true, teacher: { select: { userId: true } } } });
  return l ? { id: l.teacherId, userId: l.teacher.userId } : null;
}

/** Дисциплины студента для поля «course» (перезачёт): то, что стоит в расписании группы сейчас. */
export async function studentCourses(groupId: string) {
  const rows = await prisma.lesson.findMany({ where: { groupId, ...currentPeriod() }, distinct: ["courseId"], select: { course: { select: { name: true } } } });
  return rows.map((r) => r.course.name).sort((a, b) => a.localeCompare(b, "ru"));
}

export async function submitRequest(student: SubmitStudent, type: RequestType, payload: Record<string, string>, o: SubmitOptions = {}) {
  if (!type.enabled) throw new ServiceError("Эта услуга сейчас недоступна");

  // документы: только свои и действующие; обязательные — должны быть
  const docs = o.docIds?.length ? await prisma.studentDocument.findMany({ where: { id: { in: o.docIds }, studentId: student.id } }) : [];
  const usable = docs.filter((d) => isUsable(d));
  for (const need of typeDocs(type).filter((d) => d.required))
    if (!usable.some((d) => d.kind === need.kind)) throw new ServiceError("Не хватает обязательного документа — загрузите его в форме");

  // ситуация — только своя и открытая
  const caseId = o.caseId ? ((await prisma.situationCase.findFirst({ where: { id: o.caseId, studentId: student.id, status: "OPEN" }, select: { id: true } }))?.id ?? null) : null;

  // согласование преподавателем дисциплины
  const approvals: Prisma.RequestApprovalCreateWithoutRequestInput[] = [];
  const firstNotify: string[] = [];
  for (const [idx] of typeRoute(type).entries()) {
    const t = payload.course ? await teacherFor(student, payload.course) : null;
    if (!t) throw new ServiceError("Выберите дисциплину из своего расписания — её преподаватель согласует заявку");
    approvals.push({ idx, teacher: { connect: { id: t.id } }, status: idx === 0 ? "PENDING" : "WAITING" });
    if (idx === 0 && t.userId) firstNotify.push(t.userId);
  }

  const now = new Date();
  const auto = type.autoIssue && type.isCertificate && !o.wantsPaper && !approvals.length;
  const r = await prisma.$transaction(async (tx) => {
    const created = await tx.request.create({
      data: {
        studentId: student.id,
        typeId: type.id,
        payload,
        wantsPaper: Boolean(o.wantsPaper),
        comment: o.comment || null,
        dueAt: dueDate(now, type.slaDays),
        caseId,
        status: auto ? "READY" : "NEW",
        autoIssued: auto,
        events: {
          create: [
            { toStatus: "NEW", authorUserId: student.userId, message: o.comment || null },
            ...(auto ? [{ fromStatus: "NEW" as const, toStatus: "READY" as const, authorUserId: student.userId, message: "Справка сформирована автоматически: данные проверены по учётной базе." }] : []),
          ],
        },
        documents: { create: usable.map((d) => ({ documentId: d.id })) },
        approvals: { create: approvals },
      },
    });
    if (auto) await tx.certificate.create({ data: { requestId: created.id, verifyCode: verifyCode(), validUntil: addDays(now, 180) } });
    return created;
  });

  if (auto) await notify([student.userId], { kind: "REQUEST_STATUS", title: `${type.title}: готова`, body: `Справка готова сразу — скачайте PDF с QR-кодом в заявке № ${r.number}.`, link: `/requests/${r.id}` });
  if (firstNotify.length) await notify(firstNotify, { kind: "REQUEST_STATUS", title: "Нужно согласование", body: `«${type.title}» № ${r.number} ждёт вашего решения.`, link: "/teacher/approvals", dedupeKey: `approval:${r.id}:0` });
  return r;
}

/* ---------------- согласования (преподаватель) ---------------- */

export type Approver = { teacherId: string; userId: string };

const approvalInclude = {
  teacher: { select: { fullName: true } },
  request: {
    select: {
      id: true, number: true, payload: true, comment: true, createdAt: true, dueAt: true, status: true,
      type: { select: { title: true, fields: true } },
      student: { select: { lastName: true, firstName: true, middleName: true, group: { select: { name: true } }, faculty: { select: { shortName: true } } } },
      approvals: { orderBy: { idx: "asc" }, select: { idx: true, status: true, comment: true, decidedAt: true, teacher: { select: { fullName: true } } } },
      documents: { select: { document: { select: { id: true, kind: true, status: true, fileName: true } } } },
    },
  },
} satisfies Prisma.RequestApprovalInclude;

/** Что ждёт решения преподавателя (самые старые сверху), и недавние решения. */
export async function listApprovals(a: Approver, which: "pending" | "decided" = "pending") {
  return prisma.requestApproval.findMany({
    where: { teacherId: a.teacherId, status: which === "pending" ? "PENDING" : { in: ["APPROVED", "REJECTED"] }, ...(which === "pending" ? { request: { status: { notIn: ["REJECTED", "DONE"] } } } : {}) },
    include: approvalInclude,
    orderBy: which === "pending" ? { request: { createdAt: "asc" } } : { decidedAt: "desc" },
    take: which === "pending" ? 100 : 30,
  });
}
export type ApprovalRow = Awaited<ReturnType<typeof listApprovals>>[number];

export async function countApprovals(a: Approver) {
  return prisma.requestApproval.count({ where: { teacherId: a.teacherId, status: "PENDING", request: { status: { notIn: ["REJECTED", "DONE"] } } } });
}

/** Решение преподавателя. null — шаг не его или уже решён (повторный клик, параллельное решение). */
export async function decideApproval(a: Approver, approvalId: string, decision: "APPROVED" | "REJECTED", comment: string | null) {
  const ap = await prisma.requestApproval.findFirst({
    where: { id: approvalId, status: "PENDING", teacherId: a.teacherId },
    select: { id: true, idx: true, requestId: true, request: { select: { number: true, status: true, student: { select: { userId: true, facultyId: true } }, type: { select: { title: true } } } } },
  });
  if (!ap) return null;
  if (decision === "REJECTED" && !comment?.trim()) throw new ServiceError("Напишите причину — студент её увидит");
  const msg = comment?.trim().slice(0, 500) || null;

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.requestApproval.updateMany({ where: { id: ap.id, status: "PENDING" }, data: { status: decision, comment: msg, decidedByUserId: a.userId, decidedAt: new Date() } });
    if (!count) return null;
    if (decision === "REJECTED") {
      await tx.request.updateMany({ where: { id: ap.requestId, status: { in: ["NEW", "IN_REVIEW", "NEED_INFO"] } }, data: { status: "REJECTED" } });
      await tx.requestEvent.create({ data: { requestId: ap.requestId, fromStatus: ap.request.status, toStatus: "REJECTED", authorUserId: a.userId, message: `Не согласовано преподавателем: ${msg}` } });
      return { next: null as null | { teacherUserId: string | null } };
    }
    await tx.requestEvent.create({ data: { requestId: ap.requestId, fromStatus: ap.request.status, toStatus: ap.request.status, authorUserId: a.userId, message: `Согласовано преподавателем${msg ? `: ${msg}` : ""}` } });
    const next = await tx.requestApproval.findFirst({ where: { requestId: ap.requestId, status: "WAITING" }, orderBy: { idx: "asc" }, select: { id: true, teacher: { select: { userId: true } } } });
    if (next) await tx.requestApproval.update({ where: { id: next.id }, data: { status: "PENDING" } });
    return { next: next ? { teacherUserId: next.teacher?.userId ?? null } : null };
  });
  if (!result) return null;

  const title = ap.request.type.title;
  if (decision === "REJECTED") {
    await notify([ap.request.student.userId], { kind: "REQUEST_STATUS", title: `${title}: не согласовано`, body: `Заявка № ${ap.request.number} отклонена: ${msg}`, link: `/requests/${ap.requestId}` });
  } else if (result.next) {
    if (result.next.teacherUserId) await notify([result.next.teacherUserId], { kind: "REQUEST_STATUS", title: "Нужно согласование", body: `«${title}» № ${ap.request.number} ждёт вашего решения.`, link: "/teacher/approvals", dedupeKey: `approval:${ap.requestId}:${ap.idx + 1}` });
  } else {
    // согласование пройдено — заявка у деканата
    await notify(await deaneryUserIds(ap.request.student.facultyId), { kind: "REQUEST_STATUS", title: "Заявка согласована", body: `«${title}» № ${ap.request.number} согласована преподавателем — можно выполнять.`, link: `/staff/requests/${ap.requestId}` });
    await notify([ap.request.student.userId], { kind: "REQUEST_STATUS", title: `${title}: согласовано`, body: `Заявка № ${ap.request.number} согласована преподавателем и передана в деканат.`, link: `/requests/${ap.requestId}` });
  }
  return true;
}

/* ---------------- оценка, отзыв автовыдачи, просрочки ---------------- */

/** Оценка студента после завершения (1–5). Один раз. */
export async function rateRequest(student: { id: string }, requestId: string, rating: number, comment: string | null) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ServiceError("Оценка — от 1 до 5");
  const { count } = await prisma.request.updateMany({
    where: { id: requestId, studentId: student.id, status: { in: ["READY", "DONE", "REJECTED"] }, rating: null },
    data: { rating, ratingComment: comment?.trim().slice(0, 500) || null, ratedAt: new Date() },
  });
  return count > 0;
}

/** Отозвать автоматически выданную справку (ошибка в данных, отчисление). Студент получает уведомление. */
export async function revokeCertificate(staff: SessionStaff, requestId: string, reason: string) {
  if (reason.trim().length < 3) throw new ServiceError("Укажите причину отзыва");
  const r = await prisma.request.findFirst({ where: { id: requestId, student: studentScope(staff), certificate: { revoked: false } }, select: { id: true, number: true, status: true, student: { select: { userId: true } }, type: { select: { title: true } } } });
  if (!r) return false;
  await prisma.$transaction([
    prisma.certificate.update({ where: { requestId }, data: { revoked: true, revokedAt: new Date(), revokeReason: reason.trim().slice(0, 300) } }),
    prisma.requestEvent.create({ data: { requestId, fromStatus: r.status, toStatus: r.status, authorUserId: staff.userId, message: `Справка отозвана: ${reason.trim().slice(0, 300)}` } }),
  ]);
  await notify([r.student.userId], { kind: "REQUEST_STATUS", title: `${r.type.title}: отозвана`, body: `Справка по заявке № ${r.number} больше не действительна: ${reason.trim().slice(0, 200)}. Закажите новую или напишите в деканат.`, link: `/requests/${requestId}` });
  return true;
}

/**
 * Просроченные заявки — руководителю: уведомление сотрудникам деканата (с учётом факультета) один раз,
 * отметка escalatedAt видна во входящих и студенту («на контроле у руководителя»). Вызывается фоновым таймером.
 */
export async function escalateOverdue(now = new Date()) {
  const rows = await prisma.request.findMany({
    where: { status: { in: ["NEW", "IN_REVIEW"] }, escalatedAt: null, dueAt: { lt: now }, approvals: { none: { status: { in: ["PENDING", "WAITING"] } } } },
    select: { id: true, number: true, type: { select: { title: true } }, student: { select: { facultyId: true } } },
    take: 50,
  });
  for (const r of rows) {
    const { count } = await prisma.request.updateMany({ where: { id: r.id, escalatedAt: null }, data: { escalatedAt: now } });
    if (!count) continue;
    await notify(await deaneryUserIds(r.student.facultyId), {
      kind: "REQUEST_STATUS",
      title: "Просрочена заявка",
      body: `«${r.type.title}» № ${r.number} — срок по регламенту прошёл. Заявка на контроле у руководителя.`,
      link: `/staff/requests/${r.id}`,
      dedupeKey: `overdue:${r.id}`,
    });
  }
  return rows.length;
}
