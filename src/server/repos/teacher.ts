import "server-only";
/**
 * Данные кабинета преподавателя. Каждая функция принимает `teacher` из requireTeacher().
 * Доступ — только к парам (группа, дисциплина), где у преподавателя есть занятия.
 */
import type { Teacher } from "@prisma/client";
import { prisma } from "../db";
import { notify } from "../notify";
import { loadLessonAttendance, saveLessonAttendance, teacherLesson } from "./attendance";

export type SessionTeacher = Pick<Teacher, "id">;

export const WORK_KINDS = ["Лабораторная работа", "Практическое задание", "Тест", "Доклад", "Контрольная точка"] as const;
export const MAX_POINTS = 20;

export class TeacherAccessError extends Error {}

const semesterOf = (course: number) => course * 2 - 1;

export async function listClasses(teacher: SessionTeacher) {
  const pairs = await prisma.lesson.findMany({
    where: { teacherId: teacher.id },
    distinct: ["groupId", "courseId"],
    select: { group: { select: { id: true, name: true, course: true, _count: { select: { students: true } } } }, course: { select: { id: true, name: true } } },
  });
  return pairs
    .map((p) => ({ groupId: p.group.id, groupName: p.group.name, groupCourse: p.group.course, courseId: p.course.id, courseName: p.course.name, studentCount: p.group._count.students }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "ru") || a.courseName.localeCompare(b.courseName, "ru"));
}

/** Окно «текущего периода»: пары за последние 150 дней (и будущие). Прошлогодние группы преподавателю больше не доступны. */
export const currentPeriod = () => ({ date: { gte: new Date(Date.now() - 150 * 86400_000) } });

export async function teachesPair(teacher: SessionTeacher, groupId: string, courseId: string) {
  return (await prisma.lesson.count({ where: { teacherId: teacher.id, groupId, courseId, ...currentPeriod() } })) > 0;
}

/**
 * Каких студентов группы преподаватель ведёт по дисциплине сейчас: all — есть занятия для всей группы (лекции),
 * иначе — только перечисленные подгруппы. null — учебной связи нет.
 * Используется для всего, что касается конкретного студента: журнал, оценки, сдачи, файлы сдач.
 */
export type TeachingScope = { all: boolean; subgroups: number[] } | null;
export async function teachingScope(teacher: SessionTeacher, groupId: string, courseId: string): Promise<TeachingScope> {
  const ls = await prisma.lesson.findMany({ where: { teacherId: teacher.id, groupId, courseId, ...currentPeriod() }, distinct: ["subgroup"], select: { subgroup: true } });
  if (!ls.length) return null;
  return ls.some((l) => l.subgroup == null) ? { all: true, subgroups: [] } : { all: false, subgroups: ls.map((l) => l.subgroup!) };
}
export const inScope = (scope: TeachingScope, subgroup: number) => !!scope && (scope.all || scope.subgroups.includes(subgroup));
/** Фильтр студентов для запросов Prisma по границе подгруппы. */
export const subgroupWhere = (scope: TeachingScope) => (!scope || scope.all ? {} : { subgroup: { in: scope.subgroups } });
export async function teachesStudent(teacher: SessionTeacher, student: { groupId: string; subgroup: number }, courseId: string) {
  return inScope(await teachingScope(teacher, student.groupId, courseId), student.subgroup);
}

export async function getGradebook(teacher: SessionTeacher, groupId: string, courseId: string) {
  const scope = await teachingScope(teacher, groupId, courseId);
  if (!scope) return null;
  const [group, course] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, course: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } }),
  ]);
  if (!group || !course) return null;
  const semester = semesterOf(group.course);
  const students = await prisma.student.findMany({
    where: { groupId, ...subgroupWhere(scope), enrollments: { some: { courseId, semester } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      subgroup: true,
      enrollments: {
        where: { courseId, semester },
        select: { id: true, grades: { orderBy: { date: "asc" }, select: { id: true, kind: true, value: true, points: true, date: true, note: true } } },
      },
    },
  });
  return {
    group,
    course,
    semester,
    rows: students.map((s) => {
      const e = s.enrollments[0];
      return {
        studentId: s.id,
        name: [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" "),
        subgroup: s.subgroup,
        enrollmentId: e.id,
        grades: e.grades,
        total: e.grades.reduce((sum, g) => sum + (g.points ?? 0), 0),
      };
    }),
  };
}

export async function addGrade(teacher: SessionTeacher, enrollmentId: string, points: number, note: string) {
  const enr = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { courseId: true, semester: true, course: { select: { name: true } }, student: { select: { userId: true, groupId: true, course: true, subgroup: true } } },
  });
  // только текущий семестр (прошлые зачисления не меняем) и только студент своей подгруппы или занятия для всей группы
  if (!enr || enr.semester !== semesterOf(enr.student.course) || !(await teachesStudent(teacher, enr.student, enr.courseId))) throw new TeacherAccessError("Нет доступа к этому студенту");
  const grade = await prisma.grade.create({ data: { enrollmentId, kind: "CURRENT", value: String(points), points, date: new Date(), note } });
  await notify([enr.student.userId], { kind: "GRADE", title: "Новая оценка", body: `${enr.course.name}: ${points} баллов — ${note}`, link: "/grades" });
  return grade;
}

export async function deleteGrade(teacher: SessionTeacher, gradeId: string) {
  const g = await prisma.grade.findUnique({
    where: { id: gradeId },
    select: { kind: true, enrollment: { select: { courseId: true, semester: true, student: { select: { groupId: true, course: true, subgroup: true } } } } },
  });
  if (!g || g.kind !== "CURRENT" || g.enrollment.semester !== semesterOf(g.enrollment.student.course) || !(await teachesStudent(teacher, g.enrollment.student, g.enrollment.courseId))) return false;
  await prisma.grade.delete({ where: { id: gradeId } });
  return true;
}

/**
 * Пары преподавателя на ближайший учебный день (сегодня, если пары есть, иначе следующий день с парами, до 14 дней вперёд).
 * Подгруппы одной пары не дублируем: группа + время + дисциплина — одна строка.
 */
export async function teachingDay(teacher: SessionTeacher, today: Date) {
  const first = await prisma.lesson.findFirst({
    where: { teacherId: teacher.id, date: { gte: today, lt: new Date(today.getTime() + 14 * 86400000) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { date: true },
  });
  if (!first) return null;
  const lessons = await prisma.lesson.findMany({
    where: { teacherId: teacher.id, date: first.date },
    orderBy: { startTime: "asc" },
    select: {
      id: true, startTime: true, endTime: true, room: true, building: true, kind: true, status: true, subgroup: true, changeNote: true,
      _count: { select: { attendance: true } },
      group: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
    },
  });
  const seen = new Set<string>();
  const unique = lessons.filter((l) => {
    const k = `${l.group.id}|${l.course.id}|${l.startTime}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { date: first.date, isToday: first.date.getTime() === today.getTime(), lessons: unique };
}

/** Оценки всей группе за одну работу. Пустые поля пропускаются. Доступ проверяется для каждой записи. */
export async function addGradesBulk(teacher: SessionTeacher, groupId: string, courseId: string, note: string, items: { enrollmentId: string; points: number }[]) {
  const scope = await teachingScope(teacher, groupId, courseId);
  if (!scope) throw new TeacherAccessError("Нет доступа к этой группе");
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });
  const enrs = await prisma.enrollment.findMany({
    where: { id: { in: items.map((i) => i.enrollmentId) }, courseId, student: { groupId, ...subgroupWhere(scope) } },
    select: { id: true, semester: true, student: { select: { userId: true, course: true } } },
  });
  const allowed = new Map(enrs.filter((e) => e.semester === semesterOf(e.student.course)).map((e) => [e.id, e.student.userId]));
  const ok = items.filter((i) => allowed.has(i.enrollmentId));
  if (ok.length !== items.length) throw new TeacherAccessError("Часть студентов не из этой группы");
  const now = new Date();
  await prisma.grade.createMany({ data: ok.map((i) => ({ enrollmentId: i.enrollmentId, kind: "CURRENT" as const, value: String(i.points), points: i.points, date: now, note })) });
  for (const i of ok) {
    await notify([allowed.get(i.enrollmentId)!], { kind: "GRADE", title: "Новая оценка", body: `${course?.name ?? "Дисциплина"}: ${i.points} баллов — ${note}`, link: "/grades" });
  }
  return ok.length;
}

/* ---------- посещаемость ---------- */

/** Пара преподавателя со списком студентов и отметками. Чужая пара → null. */
export function getLessonAttendance(teacher: SessionTeacher, lessonId: string) {
  return loadLessonAttendance(teacherLesson(teacher, lessonId));
}

/** Сохранить посещаемость своей пары: все — «был», кроме absentIds. Будущие и отменённые пары отмечать нельзя. */
export async function saveAttendance(teacher: SessionTeacher, lessonId: string, absentIds: string[], today: Date) {
  try {
    return await saveLessonAttendance(teacherLesson(teacher, lessonId), absentIds, today);
  } catch (e) {
    throw new TeacherAccessError((e as Error).message);
  }
}
