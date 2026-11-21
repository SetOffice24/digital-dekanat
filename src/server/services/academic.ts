import "server-only";
/**
 * Учебный результат заявлений — чтобы «заявка выполнена» означало изменение в успеваемости, а не только статус.
 * - Пересдача: деканат назначает (дисциплина с долгом, дата, аудитория, преподаватель) → студент видит её в «Учёбе» →
 *   преподаватель фиксирует результат → оценка RETAKE закрывает долг во всех кабинетах, заявка завершается.
 * - Перезачёт: после согласования преподавателем деканат вносит перезачтённую оценку (FINAL, основание — заявка) →
 *   заявка завершается. Просто перевести такие заявки в «Готово/Выполнено» нельзя (changeRequestStatus).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { notify } from "../notify";
import { deaneryQueue, studentScope, type SessionStaff } from "../repos/staff";
import { deaneryUserIds } from "./requests";
import { fmtDateTime, moscowToday, addDays } from "@/lib/utils";

export class AcademicError extends Error {}

/** Заявления, которые завершаются только через запись учебного результата. */
export const RESULT_TYPES = ["APP_RETAKE", "APP_RECREDIT"] as const;
const OPEN = ["NEW", "IN_REVIEW", "NEED_INFO"] as const;

const isFail = (v: string | undefined) => v === "2" || v === "FAIL";
const finalOf = (grades: { kind: string; value: string }[]) => [...grades].reverse().find((g) => g.kind === "FINAL" || g.kind === "RETAKE");

export const RESULT_VALUES: Record<string, string[]> = { EXAM: ["5", "4", "3", "2"], GRADED_CREDIT: ["5", "4", "3", "2"], COURSEWORK: ["5", "4", "3", "2"], CREDIT: ["PASS", "FAIL"] };

async function staffRequest(staff: SessionStaff, requestId: string, code: (typeof RESULT_TYPES)[number], where: Prisma.RequestWhereInput = {}) {
  return prisma.request.findFirst({
    where: { id: requestId, type: { code }, ...deaneryQueue(staff), ...where },
    select: { id: true, number: true, status: true, payload: true, type: { select: { title: true } }, student: { select: { id: true, userId: true, groupId: true, course: true, facultyId: true } }, retake: { select: { id: true, resultAt: true } } },
  });
}

/* ---------------- пересдача ---------------- */

/** Что нужно деканату для назначения: долги студента и преподаватели этих дисциплин в его группе. */
export async function retakeOptions(staff: SessionStaff, requestId: string) {
  const r = await staffRequest(staff, requestId, "APP_RETAKE");
  if (!r) return null;
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: r.student.id, semester: { lt: r.student.course * 2 - 1 } }, include: { course: true, grades: { orderBy: { date: "asc" }, select: { kind: true, value: true } } } });
  const debts = enrollments.filter((e) => isFail(finalOf(e.grades)?.value)).map((e) => ({ enrollmentId: e.id, courseId: e.courseId, course: e.course.name, semester: e.semester }));
  // все преподаватели: прошлый семестр уже не в расписании, поэтому «кто вёл» — только подсказка (сверху списка)
  const teachers = await prisma.teacher.findMany({
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, userId: true, lessons: { where: { courseId: { in: debts.map((d) => d.courseId) } }, distinct: ["courseId"], select: { courseId: true } } },
  });
  const exam = r.retake ? await prisma.exam.findUnique({ where: { id: r.retake.id }, select: { id: true, date: true, room: true, teacher: true, teacherId: true, enrollmentId: true, resultAt: true, course: { select: { assessment: true } } } }) : null;
  const wanted = String((r.payload as Record<string, unknown>)?.course ?? "").toLowerCase();
  return {
    status: r.status,
    debts,
    suggested: debts.find((d) => wanted && (d.course.toLowerCase().includes(wanted) || wanted.includes(d.course.toLowerCase())))?.enrollmentId ?? debts[0]?.enrollmentId ?? null,
    teachers: teachers.map((t) => ({ id: t.id, fullName: t.fullName, courses: t.lessons.map((l) => l.courseId), hasAccount: Boolean(t.userId) })),
    exam,
  };
}

/** Назначить (или перенести, пока нет результата) пересдачу. Заявка — «Готово»: дата назначена. */
export async function scheduleRetake(staff: SessionStaff, requestId: string, v: { enrollmentId: string; startsAt: Date; room: string; teacherId: string }) {
  const r = await staffRequest(staff, requestId, "APP_RETAKE", { status: { in: [...OPEN, "READY"] } });
  if (!r) throw new AcademicError("Заявка не найдена или уже закрыта");
  if (r.retake?.resultAt) throw new AcademicError("Результат пересдачи уже зафиксирован");
  if (Number.isNaN(v.startsAt.getTime()) || v.startsAt < new Date()) throw new AcademicError("Дата пересдачи должна быть в будущем");
  if (v.startsAt > addDays(new Date(), 120)) throw new AcademicError("Не дальше чем через 4 месяца");
  const room = v.room.trim().slice(0, 60);
  if (room.length < 1) throw new AcademicError("Укажите аудиторию");
  const enr = await prisma.enrollment.findFirst({ where: { id: v.enrollmentId, studentId: r.student.id }, include: { course: true, grades: { orderBy: { date: "asc" }, select: { kind: true, value: true } } } });
  if (!enr || !isFail(finalOf(enr.grades)?.value)) throw new AcademicError("По этой дисциплине у студента нет долга");
  const t = await prisma.teacher.findUnique({ where: { id: v.teacherId }, select: { id: true, fullName: true, userId: true } });
  if (!t) throw new AcademicError("Выберите преподавателя");

  const when = fmtDateTime(v.startsAt);
  const who = t.fullName.replace(/\.$/, ""); // «Федосеев К. И.» + точка в конце фразы — без двойной
  const message = `Пересдача назначена: ${enr.course.name}, ${when}, ауд. ${room}, принимает ${who}.`;
  await prisma.$transaction(async (tx) => {
    const data = { courseId: enr.courseId, groupId: r.student.groupId, date: v.startsAt, room, kind: "RETAKE" as const, teacher: t.fullName, teacherId: t.id, studentId: r.student.id, enrollmentId: enr.id };
    if (r.retake) await tx.exam.update({ where: { id: r.retake.id }, data });
    else await tx.exam.create({ data: { ...data, requestId: r.id } });
    if (r.status !== "READY") {
      const { count } = await tx.request.updateMany({ where: { id: r.id, status: r.status }, data: { status: "READY", assigneeId: staff.id } });
      if (!count) throw new AcademicError("Статус заявки уже изменился — обновите страницу");
    }
    await tx.requestEvent.create({ data: { requestId: r.id, fromStatus: r.status, toStatus: "READY", authorUserId: staff.userId, message: r.retake ? `Пересдача перенесена: ${enr.course.name}, ${when}, ауд. ${room}, принимает ${who}.` : message } });
  });
  await notify([r.student.userId], { kind: "REQUEST_STATUS", title: r.retake ? "Пересдача перенесена" : "Пересдача назначена", body: `${enr.course.name}: ${when}, ауд. ${room}. Принимает ${t.fullName}.`, link: "/grades" });
  if (t.userId) await notify([t.userId], { kind: "SYSTEM", title: "Назначена пересдача", body: `${enr.course.name}: ${when}, ауд. ${room}. Результат — в разделе «Пересдачи».`, link: "/teacher/retakes" });
  return true;
}

/** Пересдачи, которые принимает преподаватель: предстоящие и ждущие результата. */
export function teacherRetakes(teacherId: string) {
  return prisma.exam.findMany({
    where: { teacherId, kind: "RETAKE", studentId: { not: null }, OR: [{ resultAt: null }, { resultAt: { gte: addDays(new Date(), -30) } }] },
    orderBy: [{ resultAt: { sort: "desc", nulls: "first" } }, { date: "asc" }],
    select: { id: true, date: true, room: true, resultAt: true, course: { select: { name: true, assessment: true } }, student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } }, enrollmentId: true },
  });
}
export const countRetakesToGrade = (teacherId: string) => prisma.exam.count({ where: { teacherId, kind: "RETAKE", resultAt: null, studentId: { not: null }, date: { lte: new Date() } } });

/** Результат пересдачи: только назначенный преподаватель, не раньше дня пересдачи, один раз. */
export function recordRetakeResult(teacher: { id: string; userId: string }, examId: string, value: string) {
  return applyRetakeResult({ teacherId: teacher.id }, teacher.userId, examId, value);
}

/**
 * Результат из ведомости вносит деканат — если у преподавателя нет кабинета или он передал бумажную ведомость.
 * Только студенты своей области; те же правила: не раньше дня пересдачи, один раз.
 */
export function recordRetakeResultByStaff(staff: SessionStaff, examId: string, value: string) {
  return applyRetakeResult({ student: studentScope(staff) }, staff.userId, examId, value);
}

async function applyRetakeResult(scope: Prisma.ExamWhereInput, authorUserId: string, examId: string, value: string) {
  const teacher = { userId: authorUserId };
  const e = await prisma.exam.findFirst({
    where: { id: examId, ...scope, kind: "RETAKE", resultAt: null, studentId: { not: null }, enrollmentId: { not: null } },
    select: { id: true, date: true, requestId: true, enrollmentId: true, course: { select: { name: true, assessment: true } }, student: { select: { userId: true, facultyId: true } } },
  });
  if (!e) throw new AcademicError("Пересдача не найдена или результат уже внесён");
  if (!RESULT_VALUES[e.course.assessment]?.includes(value)) throw new AcademicError("Выберите результат");
  if (e.date >= addDays(moscowToday(), 1)) throw new AcademicError("Результат можно внести в день пересдачи или позже");
  const label = value === "PASS" ? "зачтено" : value === "FAIL" ? "не зачтено" : value;
  const passed = !isFail(value);
  const ok = await prisma.$transaction(async (tx) => {
    const { count } = await tx.exam.updateMany({ where: { id: e.id, resultAt: null }, data: { resultAt: new Date() } });
    if (!count) return false;
    await tx.grade.create({ data: { enrollmentId: e.enrollmentId!, kind: "RETAKE", value, date: new Date(), note: "Пересдача", requestId: e.requestId, authorUserId: teacher.userId } });
    if (e.requestId) {
      const req = await tx.request.findUnique({ where: { id: e.requestId }, select: { status: true } });
      if (req && req.status !== "DONE" && req.status !== "REJECTED") {
        await tx.request.update({ where: { id: e.requestId }, data: { status: "DONE" } });
        await tx.requestEvent.create({ data: { requestId: e.requestId, fromStatus: req.status, toStatus: "DONE", authorUserId: teacher.userId, message: `Результат пересдачи: ${label}.${passed ? " Задолженность закрыта." : " Задолженность осталась — обратитесь в деканат."}` } });
      }
    }
    return true;
  });
  if (!ok) throw new AcademicError("Результат уже внесён");
  await notify([e.student!.userId], { kind: "GRADE", title: `Пересдача: ${e.course.name} — ${label}`, body: passed ? "Задолженность закрыта, оценка уже в «Учёбе»." : "Задолженность осталась — деканат подскажет, как быть дальше.", link: "/grades" });
  await notify(await deaneryUserIds(e.student!.facultyId), { kind: "REQUEST_STATUS", title: "Результат пересдачи", body: `${e.course.name}: ${label}.`, link: e.requestId ? `/staff/requests/${e.requestId}` : "/staff" });
  return passed;
}

/* ---------------- перезачёт ---------------- */

/** Зачисление, в которое пойдёт перезачёт: дисциплина из заявки, самый поздний семестр студента. */
async function recreditEnrollment(studentId: string, courseName: string) {
  return prisma.enrollment.findFirst({ where: { studentId, course: { name: courseName } }, orderBy: { semester: "desc" }, include: { course: true, grades: { where: { kind: { in: ["FINAL", "RETAKE"] } }, select: { id: true } } } });
}

export async function recreditOptions(staff: SessionStaff, requestId: string) {
  const r = await staffRequest(staff, requestId, "APP_RECREDIT");
  if (!r) return null;
  const p = (r.payload ?? {}) as Record<string, string>;
  const enr = p.course ? await recreditEnrollment(r.student.id, p.course) : null;
  return { status: r.status, enrollment: enr ? { id: enr.id, course: enr.course.name, semester: enr.semester, values: RESULT_VALUES[enr.course.assessment] ?? RESULT_VALUES.EXAM, hasFinal: enr.grades.length > 0 } : null, claimed: p.grade ?? "" };
}

/** Внести перезачёт (после согласования) и завершить заявку одним действием. */
export async function recordRecredit(staff: SessionStaff, requestId: string, value: string) {
  const r = await staffRequest(staff, requestId, "APP_RECREDIT", { status: { in: [...OPEN, "READY"] } });
  if (!r) throw new AcademicError("Заявка не найдена, закрыта или ещё на согласовании");
  const p = (r.payload ?? {}) as Record<string, string>;
  const enr = p.course ? await recreditEnrollment(r.student.id, p.course) : null;
  if (!enr) throw new AcademicError("Дисциплина не найдена в учебном плане студента — внесите результат вне сервиса и закройте заявку с комментарием");
  if (enr.grades.length) throw new AcademicError("По дисциплине уже есть итоговая оценка");
  const allowed = RESULT_VALUES[enr.course.assessment] ?? RESULT_VALUES.EXAM;
  if (!allowed.includes(value) || isFail(value)) throw new AcademicError("Выберите перезачтённую оценку");
  const label = value === "PASS" ? "зачтено" : value;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({ where: { id: r.id, status: r.status }, data: { status: "DONE", assigneeId: staff.id } });
    if (!count) throw new AcademicError("Статус заявки уже изменился — обновите страницу");
    await tx.grade.create({ data: { enrollmentId: enr.id, kind: "FINAL", value, date: new Date(), note: `Перезачёт: ${(p.prior ?? "").slice(0, 120)}`, requestId: r.id, authorUserId: staff.userId } });
    await tx.requestEvent.create({ data: { requestId: r.id, fromStatus: r.status, toStatus: "DONE", authorUserId: staff.userId, message: `Перезачтено: ${enr.course.name} — ${label}. Оценка внесена в успеваемость.` } });
  });
  await notify([r.student.userId], { kind: "GRADE", title: `Перезачёт: ${enr.course.name} — ${label}`, body: "Оценка внесена в успеваемость, заявка выполнена.", link: "/grades" });
  return true;
}
