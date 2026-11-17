import "server-only";
/**
 * Материалы и домашние задания.
 * Преподаватель — только свои пары (группа + дисциплина, где у него есть занятия).
 * Студент — только задания своей группы и только свои сдачи.
 */
import { Prisma, type SubmissionStatus } from "@prisma/client";
import { prisma } from "../db";
import { notify } from "../notify";
import { removeStored, storeFiles } from "../files";
import { teachesPair, TeacherAccessError, type SessionTeacher } from "./teacher";
import type { SessionStudent } from "./student";

const fileSel = { select: { id: true, name: true, size: true } } as const;

/* ---------------- преподаватель ---------------- */

async function assertPair(teacher: SessionTeacher, groupId: string, courseId: string) {
  if (!(await teachesPair(teacher, groupId, courseId))) throw new TeacherAccessError("Нет доступа к этой группе");
}

export async function listMaterials(teacher: SessionTeacher, groupId: string, courseId: string) {
  if (!(await teachesPair(teacher, groupId, courseId))) return null;
  return prisma.material.findMany({ where: { groupId, courseId }, orderBy: { createdAt: "desc" }, include: { files: fileSel } });
}

export async function addMaterial(teacher: SessionTeacher, userId: string, groupId: string, courseId: string, data: { title: string; description?: string; url?: string }, files: File[]) {
  await assertPair(teacher, groupId, courseId);
  const stored = await storeFiles(files, userId);
  const m = await prisma.material
    .create({ data: { groupId, courseId, teacherId: teacher.id, ...data, files: { create: stored } } })
    .catch(async (e) => {
      await removeStored(stored.map((f) => f.storageKey));
      throw e;
    });
  // уведомление — после сохранения; его сбой не должен превращать сохранённый материал в ошибку
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });
    const students = await prisma.student.findMany({ where: { groupId }, select: { userId: true } });
    await notify(students.map((s) => s.userId), { kind: "SYSTEM", title: `Новый материал: ${course?.name ?? ""}`, body: data.title, link: `/courses/${courseId}`, dedupeKey: `material:${m.id}` });
  } catch (e) {
    console.error("notify failed", e);
  }
  return m;
}

export async function deleteMaterial(teacher: SessionTeacher, id: string) {
  const m = await prisma.material.findUnique({ where: { id }, include: { files: { select: { storageKey: true } } } });
  if (!m || m.teacherId !== teacher.id) return false;
  await prisma.material.delete({ where: { id } });
  await removeStored(m.files.map((f) => f.storageKey));
  return true;
}

export async function listAssignments(teacher: SessionTeacher, groupId: string, courseId: string) {
  if (!(await teachesPair(teacher, groupId, courseId))) return null;
  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({ where: { groupId, courseId }, orderBy: { dueAt: "desc" }, include: { files: fileSel, submissions: { select: { status: true } } } }),
    prisma.student.count({ where: { groupId } }),
  ]);
  return rows.map((a) => ({
    ...a,
    total,
    submitted: a.submissions.length,
    toReview: a.submissions.filter((s) => s.status === "SUBMITTED").length,
    accepted: a.submissions.filter((s) => s.status === "ACCEPTED").length,
  }));
}

export async function createAssignment(teacher: SessionTeacher, userId: string, groupId: string, courseId: string, data: { title: string; description: string; dueAt: Date }, files: File[]) {
  await assertPair(teacher, groupId, courseId);
  const stored = await storeFiles(files, userId);
  const a = await prisma.assignment
    .create({ data: { groupId, courseId, teacherId: teacher.id, ...data, files: { create: stored } } })
    .catch(async (e) => {
      await removeStored(stored.map((f) => f.storageKey));
      throw e;
    });
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });
    const students = await prisma.student.findMany({ where: { groupId }, select: { userId: true } });
    const due = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(data.dueAt);
    await notify(students.map((s) => s.userId), { kind: "DEADLINE", title: `Домашнее задание: ${course?.name ?? ""}`, body: `«${data.title}» — сдать до ${due}`, link: `/homework/${a.id}`, dedupeKey: `assignment:${a.id}` });
  } catch (e) {
    console.error("notify failed", e);
  }
  return a;
}

/** Задание с полным списком группы и сдачами — для проверки. Чужое → null. */
export async function getAssignmentForTeacher(teacher: SessionTeacher, id: string) {
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: { files: fileSel, group: { select: { id: true, name: true } }, course: { select: { id: true, name: true } } },
  });
  if (!a || !(await teachesPair(teacher, a.groupId, a.courseId))) return null;
  const students = await prisma.student.findMany({
    where: { groupId: a.groupId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, submissions: { where: { assignmentId: id }, include: { files: fileSel } } },
  });
  return { assignment: a, rows: students.map((s) => ({ studentId: s.id, name: `${s.lastName} ${s.firstName}`, submission: s.submissions[0] ?? null })) };
}

/**
 * Принять / вернуть сдачу. Проверка привязана к версии: если студент успел прислать новую — «stale», ничего не меняем
 * (иначе преподаватель «принял» бы файлы, которых не видел). Повтор того же решения — без нового уведомления.
 */
export async function reviewSubmission(teacher: SessionTeacher, submissionId: string, version: number, status: "ACCEPTED" | "RETURNED", comment: string | null): Promise<true | "stale" | null> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { select: { id: true, title: true, groupId: true, courseId: true, course: { select: { name: true } } } }, student: { select: { userId: true } } },
  });
  if (!s || !(await teachesPair(teacher, s.assignment.groupId, s.assignment.courseId))) return null;
  if (s.version !== version) return "stale";
  if (s.status === status && s.teacherComment === comment) return true;
  const { count } = await prisma.submission.updateMany({ where: { id: submissionId, version }, data: { status, teacherComment: comment, reviewedAt: new Date() } });
  if (!count) return "stale";
  await notify([s.student.userId], {
    dedupeKey: `review:${submissionId}:v${version}:${status}`,
    kind: "GRADE",
    title: status === "ACCEPTED" ? `Домашнее задание принято` : `Домашнее задание — на доработку`,
    body: `${s.assignment.course.name}: «${s.assignment.title}»${comment ? `. Комментарий: ${comment}` : ""}`,
    link: `/homework/${s.assignment.id}`,
  });
  return true;
}

/** Сколько сдач ждут проверки у преподавателя — для главной. */
export function pendingReviews(teacher: SessionTeacher) {
  return prisma.submission.count({ where: { status: "SUBMITTED", assignment: { teacherId: teacher.id } } });
}

/* ---------------- студент ---------------- */

export type HomeworkState = "todo" | "overdue" | "submitted" | "returned" | "accepted";

export function homeworkState(dueAt: Date, status: SubmissionStatus | null | undefined, now = new Date()): HomeworkState {
  if (status === "ACCEPTED") return "accepted";
  if (status === "RETURNED") return "returned";
  if (status === "SUBMITTED") return "submitted";
  return dueAt < now ? "overdue" : "todo";
}

export async function listHomework(s: SessionStudent) {
  const rows = await prisma.assignment.findMany({
    where: { groupId: s.groupId },
    orderBy: { dueAt: "asc" },
    include: { course: { select: { id: true, name: true } }, teacher: { select: { fullName: true } }, submissions: { where: { studentId: s.id }, select: { status: true, submittedAt: true } } },
  });
  const now = new Date();
  return rows.map((a) => ({ ...a, submission: a.submissions[0] ?? null, state: homeworkState(a.dueAt, a.submissions[0]?.status, now) }));
}

/** Задание своей группы + своя сдача. Чужое → null. */
export async function getHomework(s: SessionStudent, id: string) {
  const a = await prisma.assignment.findFirst({
    where: { id, groupId: s.groupId },
    include: { files: fileSel, course: { select: { id: true, name: true } }, teacher: { select: { fullName: true } }, submissions: { where: { studentId: s.id }, include: { files: fileSel } } },
  });
  if (!a) return null;
  const sub = a.submissions[0] ?? null;
  return { ...a, submission: sub, state: homeworkState(a.dueAt, sub?.status) };
}

export class HomeworkError extends Error {}

/**
 * Отправить (или переотправить) домашнее задание. Новая отправка заменяет прежние файлы и увеличивает версию.
 * Принятое — не меняется (проверяется внутри транзакции условием, чтобы не проскочить мимо одновременного «Принять»).
 * Сдача после срока разрешена — у преподавателя она видна с отметкой «после срока» (решение команды 18.11).
 */
export async function submitHomework(s: SessionStudent, id: string, comment: string | null, files: File[]) {
  const a = await prisma.assignment.findFirst({ where: { id, groupId: s.groupId }, select: { id: true } });
  if (!a) throw new HomeworkError("Задание не найдено");
  const prev = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: s.id } }, include: { files: { select: { id: true, storageKey: true } } } });
  if (prev?.status === "ACCEPTED") throw new HomeworkError("Задание уже принято — менять сдачу нельзя");
  if (!files.some((f) => f && f.size > 0)) throw new HomeworkError("Прикрепите хотя бы один файл");
  const stored = await storeFiles(files, s.userId);
  try {
    const sub = await prisma.$transaction(async (tx) => {
      if (!prev) return tx.submission.create({ data: { assignmentId: id, studentId: s.id, comment, files: { create: stored } } });
      const { count } = await tx.submission.updateMany({
        where: { id: prev.id, version: prev.version, status: { not: "ACCEPTED" } },
        data: { comment, status: "SUBMITTED", submittedAt: new Date(), reviewedAt: null, teacherComment: null, version: { increment: 1 } },
      });
      if (!count) throw new HomeworkError("Сдача изменилась (её только что проверили или вы отправили её в другой вкладке) — обновите страницу");
      await tx.attachment.deleteMany({ where: { submissionId: prev.id } });
      await tx.attachment.createMany({ data: stored.map((f) => ({ ...f, submissionId: prev.id })) });
      return tx.submission.findUniqueOrThrow({ where: { id: prev.id } });
    });
    if (prev) await removeStored(prev.files.map((f) => f.storageKey));
    return sub;
  } catch (e) {
    await removeStored(stored.map((f) => f.storageKey));
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HomeworkError("Работа уже отправлена в другой вкладке — обновите страницу");
    throw e;
  }
}

/** Материалы дисциплины для своей группы. */
export function listMaterialsForStudent(s: SessionStudent, courseId: string) {
  return prisma.material.findMany({ where: { groupId: s.groupId, courseId }, orderBy: { createdAt: "desc" }, include: { files: fileSel, teacher: { select: { fullName: true } } } });
}

/** Количество материалов по дисциплинам своей группы — для карточек «Учёбы». */
export async function materialCounts(s: SessionStudent) {
  const rows = await prisma.material.groupBy({ by: ["courseId"], where: { groupId: s.groupId }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.courseId, r._count._all])) as Record<string, number>;
}
