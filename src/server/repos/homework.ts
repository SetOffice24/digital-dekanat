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
import { MAX_POINTS, teachesPair, TeacherAccessError, type SessionTeacher } from "./teacher";
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
  // группа + те, кто сдал и потом был переведён: их работы остаются у преподавателя на проверке
  const students = await prisma.student.findMany({
    where: { OR: [{ groupId: a.groupId }, { submissions: { some: { assignmentId: id } } }] },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, groupId: true, group: { select: { name: true } }, submissions: { where: { assignmentId: id }, include: { files: fileSel, grade: { select: { points: true } } } } },
  });
  return {
    assignment: a,
    rows: students.map((s) => ({ studentId: s.id, name: `${s.lastName} ${s.firstName}`, movedTo: s.groupId !== a.groupId ? s.group.name : null, submission: s.submissions[0] ?? null })),
  };
}

/**
 * Принять / вернуть сдачу. Проверка привязана к версии: если студент успел прислать новую — «stale», ничего не меняем
 * (иначе преподаватель «принял» бы файлы, которых не видел). Повтор того же решения — без нового уведомления.
 * Баллы за работу (по желанию преподавателя) — в том же действии и той же транзакции: оценка связана со сдачей
 * (Grade.submissionId, одна на сдачу), видна студенту в задании и в журнале. Возврат на доработку снимает баллы за работу —
 * преподаватель видит это предупреждение до нажатия. ИИ баллы не ставит.
 */
export async function reviewSubmission(
  teacher: SessionTeacher,
  submissionId: string,
  version: number,
  status: "ACCEPTED" | "RETURNED",
  comment: string | null,
  points: number | null = null,
): Promise<true | "stale" | null> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: { select: { id: true, title: true, groupId: true, courseId: true, course: { select: { name: true } } } },
      student: { select: { userId: true, course: true } },
      grade: { select: { id: true, points: true } },
    },
  });
  if (!s || !(await teachesPair(teacher, s.assignment.groupId, s.assignment.courseId))) return null;
  if (s.version !== version) return "stale";
  const pts = status === "ACCEPTED" ? points : null;
  if (s.status === status && s.teacherComment === comment && (s.grade?.points ?? null) === pts) return true;
  // баллы — в зачисление текущего семестра студента по этой дисциплине
  const enrollment = pts === null ? null : await prisma.enrollment.findFirst({ where: { studentId: s.studentId, courseId: s.assignment.courseId, semester: s.student.course * 2 - 1 }, select: { id: true } });
  if (pts !== null && !enrollment) throw new HomeworkError("Студент не зачислен на дисциплину в этом семестре — баллы поставить нельзя, примите без баллов");
  const ok = await prisma.$transaction(async (tx) => {
    const { count } = await tx.submission.updateMany({ where: { id: submissionId, version }, data: { status, teacherComment: comment, reviewedAt: new Date() } });
    if (!count) return false;
    if (pts === null) await tx.grade.deleteMany({ where: { submissionId } });
    else
      await tx.grade.upsert({
        where: { submissionId },
        create: { submissionId, enrollmentId: enrollment!.id, kind: "CURRENT", value: String(pts), points: pts, date: new Date(), note: `ДЗ «${s.assignment.title}»`, authorUserId: (await tx.teacher.findUnique({ where: { id: teacher.id }, select: { userId: true } }))?.userId ?? null },
        update: { value: String(pts), points: pts, date: new Date() },
      });
    return true;
  });
  if (!ok) return "stale";
  await notify([s.student.userId], {
    dedupeKey: `review:${submissionId}:v${version}:${status}:${pts ?? "-"}`,
    kind: "GRADE",
    title: status === "ACCEPTED" ? (pts !== null ? `Домашнее задание принято: ${pts} из ${MAX_POINTS}` : `Домашнее задание принято`) : `Домашнее задание — на доработку`,
    body: `${s.assignment.course.name}: «${s.assignment.title}»${status === "RETURNED" && s.grade ? " (баллы за работу сняты до повторной проверки)" : ""}${comment ? `. Комментарий: ${comment}` : ""}`,
    link: `/homework/${s.assignment.id}`,
  });
  return true;
}

/**
 * Очередь проверки: все сдачи «на проверке» по заданиям преподавателя (только текущие учебные связи),
 * сгруппированы по заданию, дольше всего ждущие — сверху.
 */
export async function reviewQueue(teacher: SessionTeacher) {
  const rows = await prisma.submission.findMany({
    where: { status: "SUBMITTED", assignment: { teacherId: teacher.id } },
    orderBy: { submittedAt: "asc" },
    take: 300,
    select: { id: true, submittedAt: true, version: true, student: { select: { lastName: true, firstName: true } }, assignment: { select: { id: true, title: true, dueAt: true, groupId: true, courseId: true, group: { select: { name: true } }, course: { select: { name: true } } } } },
  });
  const allowed = new Map<string, boolean>();
  const groups = new Map<string, { assignment: (typeof rows)[number]["assignment"]; items: { id: string; name: string; submittedAt: Date; late: boolean; resubmitted: boolean; waitDays: number }[] }>();
  const now = Date.now();
  for (const r of rows) {
    const pair = r.assignment.groupId + "|" + r.assignment.courseId;
    if (!allowed.has(pair)) allowed.set(pair, await teachesPair(teacher, r.assignment.groupId, r.assignment.courseId));
    if (!allowed.get(pair)) continue;
    const g = groups.get(r.assignment.id) ?? { assignment: r.assignment, items: [] };
    g.items.push({ id: r.id, name: `${r.student.lastName} ${r.student.firstName}`, submittedAt: r.submittedAt, late: r.submittedAt > r.assignment.dueAt, resubmitted: r.version > 1, waitDays: Math.floor((now - r.submittedAt.getTime()) / 86400_000) });
    groups.set(r.assignment.id, g);
  }
  return [...groups.values()];
}

/** Сколько сдач ждут проверки у преподавателя — для главной. */
export async function pendingReviews(teacher: SessionTeacher) {
  // то же, что в очереди «Проверить работы» (только текущие учебные связи) — число и список совпадают
  return (await reviewQueue(teacher)).reduce((n, g) => n + g.items.length, 0);
}

/* ---------------- студент ---------------- */

export type HomeworkState = "todo" | "overdue" | "submitted" | "returned" | "accepted";

export function homeworkState(dueAt: Date, status: SubmissionStatus | null | undefined, now = new Date()): HomeworkState {
  if (status === "ACCEPTED") return "accepted";
  if (status === "RETURNED") return "returned";
  if (status === "SUBMITTED") return "submitted";
  return dueAt < now ? "overdue" : "todo";
}

/** Сдачи прошлой группы после перевода тоже показываем — со статусом и комментарием преподавателя. */
const mineOrMyGroup = (s: SessionStudent) => ({ OR: [{ groupId: s.groupId }, { submissions: { some: { studentId: s.id } } }] });

export async function listHomework(s: SessionStudent) {
  const rows = await prisma.assignment.findMany({
    where: mineOrMyGroup(s),
    orderBy: { dueAt: "asc" },
    include: { course: { select: { id: true, name: true } }, teacher: { select: { fullName: true } }, submissions: { where: { studentId: s.id }, select: { status: true, submittedAt: true } } },
  });
  const now = new Date();
  return rows.map((a) => ({ ...a, submission: a.submissions[0] ?? null, state: homeworkState(a.dueAt, a.submissions[0]?.status, now) }));
}

/** Задание своей группы + своя сдача. Чужое → null. */
export async function getHomework(s: SessionStudent, id: string) {
  const a = await prisma.assignment.findFirst({
    where: { id, ...mineOrMyGroup(s) },
    include: { files: fileSel, course: { select: { id: true, name: true } }, teacher: { select: { fullName: true } }, submissions: { where: { studentId: s.id }, include: { files: fileSel, grade: { select: { points: true } } } } },
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
  const a = await prisma.assignment.findFirst({ where: { id, ...mineOrMyGroup(s) }, select: { id: true, groupId: true, courseId: true, title: true, teacher: { select: { userId: true } }, course: { select: { name: true } } } });
  if (!a) throw new HomeworkError("Задание не найдено");
  const prev = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: s.id } }, include: { files: { select: { id: true, storageKey: true } } } });
  // задание прежней группы (после перевода) — только доработка уже возвращённой работы, новые сдачи нельзя
  if (a.groupId !== s.groupId && prev?.status !== "RETURNED") throw new HomeworkError("Это задание вашей прежней группы — сдать его уже нельзя");
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
    // сигнал преподавателю: новая сдача ждёт проверки (по одному на версию — повторы не множатся)
    if (a.teacher.userId) {
      const who = await prisma.student.findUnique({ where: { id: s.id }, select: { lastName: true, firstName: true } });
      await notify([a.teacher.userId], {
        kind: "DEADLINE",
        title: sub.version > 1 ? "Исправленная работа на проверке" : "Новая работа на проверке",
        body: `${who ? `${who.lastName} ${who.firstName}` : "Студент"} — ${a.course.name}: «${a.title}»`,
        link: `/teacher/${a.groupId}/${a.courseId}/homework/${a.id}`,
        dedupeKey: `submitted:${sub.id}:v${sub.version}`,
      }).catch((e) => console.error("notify teacher", e));
    }
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
