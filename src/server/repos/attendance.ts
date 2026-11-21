import "server-only";
/**
 * Посещаемость: общий код для преподавателя (свои пары), деканата (пары своего факультета / всех) и студента (только своё).
 * Отметить можно только прошедшую или сегодняшнюю неотменённую пару; список студентов — группа (и подгруппа) этой пары.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { currentPeriod, type SessionTeacher } from "./teacher";
import type { SessionStaff } from "./staff";
import type { SessionStudent } from "./student";

export class AttendanceError extends Error {}

const lessonSelect = {
  id: true, date: true, startTime: true, endTime: true, room: true, kind: true, status: true, subgroup: true,
  group: { select: { id: true, name: true } }, course: { select: { id: true, name: true } }, teacher: { select: { fullName: true } },
} satisfies Prisma.LessonSelect;

/** Пара + список студентов с отметками; null — пары нет или нет доступа (where задаёт область доступа). */
export async function loadLessonAttendance(where: Prisma.LessonWhereInput) {
  const lesson = await prisma.lesson.findFirst({ where, select: lessonSelect });
  if (!lesson) return null;
  const students = await prisma.student.findMany({
    where: { groupId: lesson.group.id, ...(lesson.subgroup ? { subgroup: lesson.subgroup } : {}) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, attendance: { where: { lessonId: lesson.id }, select: { present: true } } },
  });
  return {
    lesson,
    students: students.map((s) => ({ id: s.id, lastName: s.lastName, firstName: s.firstName, middleName: s.middleName, present: s.attendance[0]?.present ?? null })),
    marked: students.some((s) => s.attendance.length > 0),
  };
}

/** Сохранить отметки: все — «был», кроме absentIds. */
export async function saveLessonAttendance(where: Prisma.LessonWhereInput, absentIds: string[], today: Date) {
  const data = await loadLessonAttendance(where);
  if (!data) throw new AttendanceError("Нет доступа к этой паре");
  if (data.lesson.status === "CANCELLED") throw new AttendanceError("Пара отменена");
  if (data.lesson.date.getTime() > today.getTime()) throw new AttendanceError("Будущую пару отметить нельзя");
  const ids = new Set(data.students.map((s) => s.id));
  if (absentIds.some((id) => !ids.has(id))) throw new AttendanceError("Студент не из этой группы");
  const absent = new Set(absentIds);
  const lessonId = data.lesson.id;
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

/* ---------- области доступа ---------- */
export const teacherLesson = (t: SessionTeacher, id: string): Prisma.LessonWhereInput => ({ id, teacherId: t.id });
export const staffLesson = (s: SessionStaff, id: string): Prisma.LessonWhereInput => ({ id, ...(s.facultyId ? { group: { program: { facultyId: s.facultyId } } } : {}) });

const pct = (present: number, total: number) => (total ? Math.round((present / total) * 100) : null);

/* ---------- преподаватель: посещаемость дисциплины ---------- */

/** Прошедшие пары преподавателя в группе по дисциплине (с отметками) + итог по студентам. */
export async function courseAttendance(t: SessionTeacher, groupId: string, courseId: string, today: Date) {
  const lessons = await prisma.lesson.findMany({
    where: { teacherId: t.id, groupId, courseId, date: { lte: today, gte: currentPeriod().date.gte } },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    take: 40,
    select: { id: true, date: true, startTime: true, kind: true, status: true, subgroup: true, attendance: { select: { present: true, studentId: true } } },
  });
  if (!lessons.length && !(await prisma.lesson.count({ where: { teacherId: t.id, groupId, courseId, ...currentPeriod() } }))) return null;
  const students = await prisma.student.findMany({ where: { groupId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, lastName: true, firstName: true } });
  const byStudent = new Map(students.map((s) => [s.id, { ...s, total: 0, present: 0 }]));
  for (const l of lessons) for (const a of l.attendance) {
    const s = byStudent.get(a.studentId);
    if (s) {
      s.total++;
      if (a.present) s.present++;
    }
  }
  return {
    lessons: lessons.map((l) => ({ id: l.id, date: l.date, startTime: l.startTime, kind: l.kind, status: l.status, subgroup: l.subgroup, marked: l.attendance.length, present: l.attendance.filter((a) => a.present).length })),
    students: [...byStudent.values()].map((s) => ({ ...s, percent: pct(s.present, s.total) })).sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101)),
  };
}

/* ---------- деканат: сводка по группе ---------- */

export async function groupAttendance(staff: SessionStaff, groupId: string) {
  const group = await prisma.group.findFirst({ where: { id: groupId, ...(staff.facultyId ? { program: { facultyId: staff.facultyId } } : {}) }, select: { id: true, name: true } });
  if (!group) return null;
  const students = await prisma.student.findMany({
    where: { groupId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true, lastName: true, firstName: true,
      // только пары этой группы: отметки студента в прежней группе остаются в его личной истории
      attendance: { where: { lesson: { groupId } }, select: { present: true, lesson: { select: { date: true, startTime: true, course: { select: { name: true } } } } }, orderBy: { lesson: { date: "desc" } } },
    },
  });
  const rows = students.map((s) => {
    const total = s.attendance.length;
    const present = s.attendance.filter((a) => a.present).length;
    return { id: s.id, name: `${s.lastName} ${s.firstName}`, total, present, absent: total - present, percent: pct(present, total), recent: s.attendance.filter((a) => !a.present).slice(0, 5).map((a) => a.lesson) };
  });
  rows.sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));
  const total = rows.reduce((a, r) => a + r.total, 0);
  const present = rows.reduce((a, r) => a + r.present, 0);
  return { group, rows, percent: pct(present, total) };
}

/* ---------- студент: история ---------- */

/** Вся своя посещаемость: по дисциплинам и по датам; пропуски, покрытые заявлением о пропуске, помечаются. */
export async function attendanceHistory(s: SessionStudent) {
  const [rows, absenceRequests] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: s.id },
      orderBy: [{ lesson: { date: "desc" } }, { lesson: { startTime: "desc" } }],
      select: { present: true, lesson: { select: { id: true, date: true, startTime: true, endTime: true, kind: true, course: { select: { id: true, name: true } } } } },
    }),
    prisma.request.findMany({ where: { studentId: s.id, type: { code: "APP_ABSENCE" }, status: { not: "REJECTED" } }, select: { id: true, number: true, status: true, payload: true } }),
  ]);
  const covers = absenceRequests
    .map((r) => {
      const p = (r.payload ?? {}) as Record<string, string>;
      return { id: r.id, number: r.number, approved: r.status === "DONE", from: p.dateFrom, to: p.dateTo };
    })
    .filter((r) => r.from && r.to);
  const coverFor = (d: Date) => {
    const iso = d.toISOString().slice(0, 10);
    return covers.find((c) => c.from <= iso && iso <= c.to) ?? null;
  };
  const byCourse = new Map<string, { id: string; name: string; total: number; present: number }>();
  for (const r of rows) {
    const c = byCourse.get(r.lesson.course.id) ?? { id: r.lesson.course.id, name: r.lesson.course.name, total: 0, present: 0 };
    c.total++;
    if (r.present) c.present++;
    byCourse.set(c.id, c);
  }
  const present = rows.filter((r) => r.present).length;
  return {
    total: rows.length,
    present,
    percent: pct(present, rows.length),
    courses: [...byCourse.values()].map((c) => ({ ...c, percent: pct(c.present, c.total) })).sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101)),
    history: rows.map((r) => ({ ...r.lesson, present: r.present, cover: r.present ? null : coverFor(r.lesson.date) })),
  };
}
