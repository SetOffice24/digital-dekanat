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
