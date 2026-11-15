import "server-only";
/**
 * Данные кабинета преподавателя. Каждая функция принимает `teacher` из requireTeacher().
 * Доступ — только к парам (группа, дисциплина), где у преподавателя есть занятия.
 */
import type { Teacher } from "@prisma/client";
import { prisma } from "../db";
import { notify } from "../notify";

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

async function teachesPair(teacher: SessionTeacher, groupId: string, courseId: string) {
  return (await prisma.lesson.count({ where: { teacherId: teacher.id, groupId, courseId } })) > 0;
}

export async function getGradebook(teacher: SessionTeacher, groupId: string, courseId: string) {
  if (!(await teachesPair(teacher, groupId, courseId))) return null;
  const [group, course] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, course: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } }),
  ]);
  if (!group || !course) return null;
  const semester = semesterOf(group.course);
  const students = await prisma.student.findMany({
    where: { groupId, enrollments: { some: { courseId, semester } } },
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
    select: { courseId: true, course: { select: { name: true } }, student: { select: { userId: true, groupId: true } } },
  });
  if (!enr || !(await teachesPair(teacher, enr.student.groupId, enr.courseId))) throw new TeacherAccessError("Нет доступа к этому студенту");
  const grade = await prisma.grade.create({ data: { enrollmentId, kind: "CURRENT", value: String(points), points, date: new Date(), note } });
  await notify([enr.student.userId], { kind: "GRADE", title: "Новая оценка", body: `${enr.course.name}: ${points} баллов — ${note}`, link: "/grades" });
  return grade;
}

export async function deleteGrade(teacher: SessionTeacher, gradeId: string) {
  const g = await prisma.grade.findUnique({
    where: { id: gradeId },
    select: { kind: true, enrollment: { select: { courseId: true, student: { select: { groupId: true } } } } },
  });
  if (!g || g.kind !== "CURRENT" || !(await teachesPair(teacher, g.enrollment.student.groupId, g.enrollment.courseId))) return false;
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
  if (!(await teachesPair(teacher, groupId, courseId))) throw new TeacherAccessError("Нет доступа к этой группе");
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });
  const enrs = await prisma.enrollment.findMany({
    where: { id: { in: items.map((i) => i.enrollmentId) }, courseId, student: { groupId } },
    select: { id: true, student: { select: { userId: true } } },
  });
  const allowed = new Map(enrs.map((e) => [e.id, e.student.userId]));
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
export async function getLessonAttendance(teacher: SessionTeacher, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, teacherId: teacher.id },
    select: { id: true, date: true, startTime: true, endTime: true, room: true, kind: true, status: true, subgroup: true, group: { select: { id: true, name: true } }, course: { select: { id: true, name: true } } },
  });
  if (!lesson) return null;
  const students = await prisma.student.findMany({
    where: { groupId: lesson.group.id, ...(lesson.subgroup ? { subgroup: lesson.subgroup } : {}) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, attendance: { where: { lessonId }, select: { present: true } } },
  });
  return {
    lesson,
    students: students.map((s) => ({ id: s.id, lastName: s.lastName, firstName: s.firstName, middleName: s.middleName, present: s.attendance[0]?.present ?? null })),
    marked: students.some((s) => s.attendance.length > 0),
  };
}

/** Сохранить посещаемость пары: все студенты списка — «был», кроме `absentIds`. Будущие и отменённые пары отмечать нельзя. */
export async function saveAttendance(teacher: SessionTeacher, lessonId: string, absentIds: string[], today: Date) {
  const data = await getLessonAttendance(teacher, lessonId);
  if (!data) throw new TeacherAccessError("Нет доступа к этой паре");
  if (data.lesson.status === "CANCELLED") throw new TeacherAccessError("Пара отменена");
  if (data.lesson.date.getTime() > today.getTime()) throw new TeacherAccessError("Будущую пару отметить нельзя");
  const ids = new Set(data.students.map((s) => s.id));
  if (absentIds.some((id) => !ids.has(id))) throw new TeacherAccessError("Студент не из этой группы");
  const absent = new Set(absentIds);
  await prisma.$transaction(
    data.students.map((s) =>
      prisma.attendance.upsert({
        where: { lessonId_studentId: { lessonId, studentId: s.id } },
        create: { lessonId, studentId: s.id, present: !absent.has(s.id) },
        update: { present: !absent.has(s.id), markedAt: new Date() },
      }),
    ),
  );
  return { total: data.students.length, absent: absent.size };
}
