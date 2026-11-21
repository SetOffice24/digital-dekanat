import "server-only";
import { submitRequest } from "../services/requests";
/**
 * Данные студента. ПРАВИЛО: каждая функция принимает студента, полученного из сессии
 * (requireStudent / apiStudent), и фильтрует по его id / группе. Варианта «без фильтра» нет.
 */
import type { Student, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { addDays } from "@/lib/utils";

export type SessionStudent = Pick<Student, "id" | "userId" | "groupId" | "subgroup" | "facultyId" | "course">;

/* ---------- профиль ---------- */
export function getProfile(s: SessionStudent) {
  return prisma.student.findUniqueOrThrow({
    where: { id: s.id },
    include: { faculty: true, program: true, group: true, user: { select: { login: true } } },
  });
}

/* ---------- расписание ---------- */
export function getLessons(s: SessionStudent, from: Date, toExclusive: Date) {
  return prisma.lesson.findMany({
    where: {
      groupId: s.groupId,
      OR: [{ subgroup: null }, { subgroup: s.subgroup }],
      date: { gte: from, lt: toExclusive },
    },
    include: { course: true, teacher: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}
export type LessonWithRefs = Awaited<ReturnType<typeof getLessons>>[number];

/* ---------- успеваемость ---------- */
export function getEnrollments(s: SessionStudent) {
  return prisma.enrollment.findMany({
    where: { studentId: s.id },
    include: { course: true, grades: { orderBy: { date: "asc" } } },
    orderBy: [{ semester: "desc" }],
  });
}
export type EnrollmentWithGrades = Awaited<ReturnType<typeof getEnrollments>>[number];

export function currentSemester(s: SessionStudent) {
  return s.course * 2 - 1;
}

/** Сводка: средний балл по итоговым оценкам, долги, прогресс текущего семестра. */
export function summarize(enrollments: EnrollmentWithGrades[], curSem: number) {
  const finals: number[] = [];
  const debts: { course: string; semester: number; enrollmentId: string }[] = [];
  for (const e of enrollments) {
    if (e.semester >= curSem) continue;
    const final = [...e.grades].reverse().find((g) => g.kind === "FINAL" || g.kind === "RETAKE");
    if (!final) continue;
    const n = Number(final.value);
    if (!Number.isNaN(n)) finals.push(n);
    if (final.value === "2" || final.value === "FAIL") debts.push({ course: e.course.name, semester: e.semester, enrollmentId: e.id });
  }
  const passing = finals.filter((n) => n >= 3);
  const avg = passing.length ? passing.reduce((a, b) => a + b, 0) / passing.length : null;
  // текущий семестр: сумма баллов из 100 (накопительная, 4 контрольные точки по 25)
  const current = enrollments
    .filter((e) => e.semester === curSem)
    .map((e) => {
      const work = e.grades.filter((g) => g.kind === "CURRENT" || g.kind === "MIDTERM");
      const pts = work.reduce((a, g) => a + (g.points ?? 0), 0);
      const max = Math.max(work.length * 20, 1);
      // итоговая уже есть (например, перезачёт) — дисциплина закрыта
      const final = [...e.grades].reverse().find((g) => g.kind === "FINAL" || g.kind === "RETAKE") ?? null;
      return { enrollment: e, points: pts, max, ratio: pts / max, final };
    });
  const risky = current.filter((c) => !c.final && c.ratio < 0.6);
  return { avg, debts, current, risky };
}

export function getExams(s: SessionStudent) {
  return prisma.exam.findMany({
    // экзамены группы + индивидуальные пересдачи самого студента (чужие пересдачи не видны)
    where: { OR: [{ groupId: s.groupId, studentId: null }, { studentId: s.id }] },
    include: { course: true },
    orderBy: { date: "asc" },
  });
}

/* ---------- заявки ---------- */
export function listRequests(s: SessionStudent) {
  return prisma.request.findMany({
    where: { studentId: s.id },
    include: { type: true, certificate: { select: { id: true, revoked: true } }, approvals: { orderBy: { idx: "asc" }, select: { status: true, teacher: { select: { fullName: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Чужая заявка → null (страница отдаёт 404, неотличимо от «не существует»). */
export function getRequest(s: SessionStudent, id: string) {
  return prisma.request.findFirst({
    where: { id, studentId: s.id },
    include: {
      type: true,
      certificate: true,
      events: { orderBy: { createdAt: "asc" }, include: { author: { select: { role: true } } } },
      approvals: { orderBy: { idx: "asc" }, include: { teacher: { select: { fullName: true } } } },
      documents: { include: { document: { select: { id: true, kind: true, status: true, reviewNote: true } } } },
      appointments: { where: { status: "BOOKED" }, select: { id: true, startsAt: true } },
      case: { select: { id: true, code: true } },
      retake: { select: { date: true, room: true, teacher: true, resultAt: true, course: { select: { name: true } } } },
    },
  });
}

/** Порядок — от самых частых к редким: справки → заявления → обращения. */
const TYPE_ORDER = ["CERT_STUDY", "CERT_SCHOLARSHIP", "CERT_MILITARY", "APP_ABSENCE", "APP_RETAKE", "APP_RECREDIT", "APP_TRANSFER", "APP_ACADEMIC_LEAVE", "APP_MATHELP", "ACC_BANK", "DORM_CHECKIN", "APP_OTHER"];
/** Услуги единого окна, доступные студентам (выключенные деканатом не показываем). */
export async function listRequestTypes() {
  const types = await prisma.requestType.findMany({ where: { enabled: true } });
  return types.sort((a, b) => TYPE_ORDER.indexOf(a.code) - TYPE_ORDER.indexOf(b.code));
}

/** Подача заявки — через единое окно (документы, маршрут согласования, автовыдача, срок): src/server/services/requests.ts. */
export async function createRequest(s: SessionStudent, typeId: string, payload: Prisma.InputJsonValue, wantsPaper: boolean, comment?: string, extra: { docIds?: string[]; caseId?: string | null } = {}) {
  const type = await prisma.requestType.findUniqueOrThrow({ where: { id: typeId } });
  return submitRequest(s, type, payload as Record<string, string>, { wantsPaper, comment, ...extra });
}

export async function answerRequest(s: SessionStudent, id: string, message: string) {
  // условное обновление: если деканат параллельно сменил статус (отклонил, выполнил), ответ не вернёт заявку в работу
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({ where: { id, studentId: s.id, status: "NEED_INFO" }, data: { status: "IN_REVIEW" } });
    if (!count) return null;
    await tx.requestEvent.create({ data: { requestId: id, fromStatus: "NEED_INFO", toStatus: "IN_REVIEW", authorUserId: s.userId, message } });
    return tx.request.findUnique({ where: { id } });
  });
}

export function getCertificateForStudent(s: SessionStudent, requestId: string) {
  return prisma.certificate.findFirst({
    where: { requestId, request: { studentId: s.id }, revoked: false },
    include: { request: { include: { type: true, student: { include: { faculty: true, program: true, group: true } } } } },
  });
}

/* ---------- объявления, дедлайны ---------- */
const audienceFilter = (s: SessionStudent) => ({
  OR: [{ audience: "ALL" as const }, { audience: "FACULTY" as const, facultyId: s.facultyId }, { audience: "GROUP" as const, groupId: s.groupId }],
});

export function listAnnouncements(s: SessionStudent, take = 20) {
  return prisma.announcement.findMany({
    where: audienceFilter(s),
    include: { author: { select: { fullName: true, position: true } } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take,
  });
}

export function listDeadlines(s: SessionStudent, days = 14) {
  const now = new Date();
  return prisma.deadline.findMany({
    where: { ...audienceFilter(s), dueAt: { gte: now, lt: addDays(now, days) } },
    orderBy: { dueAt: "asc" },
  });
}

/* ---------- уведомления (по userId из сессии) ---------- */
export function listNotifications(userId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export function markRead(userId: string, id?: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
}

/* ---------- самочувствие ---------- */
export function getCheckin(s: SessionStudent, weekStart: Date) {
  return prisma.wellbeingCheckin.findUnique({ where: { studentId_weekStart: { studentId: s.id, weekStart } } });
}

export function saveCheckin(s: SessionStudent, weekStart: Date, mood: number) {
  return prisma.wellbeingCheckin.upsert({
    where: { studentId_weekStart: { studentId: s.id, weekStart } },
    create: { studentId: s.id, weekStart, mood },
    update: { mood },
  });
}

/** Посещаемость студента: только свои отметки. */
export async function getAttendance(s: SessionStudent) {
  const rows = await prisma.attendance.findMany({
    where: { studentId: s.id },
    orderBy: { lesson: { date: "desc" } },
    select: { present: true, lesson: { select: { date: true, startTime: true, course: { select: { name: true } } } } },
  });
  const present = rows.filter((r) => r.present).length;
  return { total: rows.length, present, percent: rows.length ? Math.round((present / rows.length) * 100) : null, absences: rows.filter((r) => !r.present).map((r) => r.lesson) };
}
