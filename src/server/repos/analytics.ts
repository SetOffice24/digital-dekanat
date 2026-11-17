import "server-only";
/**
 * Успеваемость для деканата и преподавателя: ведомость группы, статистика по группам, личное дело студента,
 * статистика дисциплины. Только чтение. Области доступа:
 * - деканат: группы своего факультета (или все, если сотрудник не привязан к факультету);
 * - преподаватель: только свои пары (группа + дисциплина, где у него есть занятия).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { forecast, isBelow, type Forecast } from "@/lib/grading";
import { homeworkState } from "./homework";
import type { SessionStaff } from "./staff";
import { teachesPair, type SessionTeacher } from "./teacher";

const groupScope = (s: SessionStaff): Prisma.GroupWhereInput => (s.facultyId ? { program: { facultyId: s.facultyId } } : {});
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const semesterOf = (course: number) => course * 2 - 1;

type Grade = { kind: string; value: string; points: number | null; date: Date };
type Enr = { id: string; semester: number; courseId: string; course: { id: string; name: string; assessment: string }; grades: Grade[] };

/** Баллы текущего семестра по дисциплине: null — оценок ещё нет. */
export function currentScore(e: Enr) {
  // текущие оценки и контрольные точки (MIDTERM) — как в «Учёбе» у студента; итоговые не учитываем
  const cur = e.grades.filter((g) => g.kind !== "FINAL" && g.kind !== "RETAKE" && g.points != null);
  if (!cur.length) return null;
  const points = cur.reduce((a, g) => a + (g.points ?? 0), 0);
  const max = cur.length * 20;
  const ratio = points / max;
  return { points, max, ratio, forecast: forecast(ratio, e.course.assessment === "CREDIT") };
}

const finalOf = (e: Enr) => [...e.grades].reverse().find((g) => g.kind === "FINAL" || g.kind === "RETAKE") ?? null;

/** Средний балл по итоговым оценкам прошлых семестров и долги — те же правила, что у студента в «Учёбе». */
function history(enrs: Enr[], curSem: number) {
  const finals: number[] = [];
  const debts: { course: string; semester: number }[] = [];
  for (const e of enrs) {
    if (e.semester >= curSem) continue;
    const f = finalOf(e);
    if (!f) continue;
    const n = Number(f.value);
    if (!Number.isNaN(n)) finals.push(n);
    if (f.value === "2" || f.value === "FAIL") debts.push({ course: e.course.name, semester: e.semester });
  }
  const passing = finals.filter((n) => n >= 3);
  return { avg: passing.length ? passing.reduce((a, b) => a + b, 0) / passing.length : null, debts };
}

const studentSelect = (groupId: string) =>
  ({
    where: { groupId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true, lastName: true, firstName: true, middleName: true, subgroup: true,
      enrollments: { select: { id: true, semester: true, courseId: true, course: { select: { id: true, name: true, assessment: true } }, grades: { select: { kind: true, value: true, points: true, date: true }, orderBy: { date: "asc" as const } } } },
    },
  }) satisfies Prisma.StudentFindManyArgs;

/** Посещаемость (присутствовал / всего) по студентам группы. */
async function attendanceByStudent(groupId: string, courseId?: string) {
  const rows = await prisma.attendance.groupBy({ by: ["studentId", "present"], where: { student: { groupId }, ...(courseId ? { lesson: { courseId } } : {}) }, _count: { _all: true } });
  const m = new Map<string, { present: number; total: number }>();
  for (const r of rows) {
    const x = m.get(r.studentId) ?? { present: 0, total: 0 };
    x.total += r._count._all;
    if (r.present) x.present += r._count._all;
    m.set(r.studentId, x);
  }
  return m;
}

/** Домашние задания группы: по студенту — сколько из «должных» сдано, сколько просрочено/на доработке. */
async function homeworkByStudent(groupId: string, courseId?: string) {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({ where: { groupId, ...(courseId ? { courseId } : {}) }, select: { id: true, dueAt: true, submissions: { select: { studentId: true, status: true, submittedAt: true } } } });
  const m = new Map<string, { due: number; done: number; missing: number; returned: number; late: number; onTime: number }>();
  const get = (id: string) => m.get(id) ?? { due: 0, done: 0, missing: 0, returned: 0, late: 0, onTime: 0 };
  return {
    assignments,
    of(studentId: string) {
      if (!m.has(studentId)) {
        const x = get(studentId);
        for (const a of assignments) {
          const s = a.submissions.find((z) => z.studentId === studentId);
          const state = homeworkState(a.dueAt, s?.status, now);
          if (a.dueAt < now || s) x.due++;
          if (s) {
            x.done++;
            if (s.submittedAt > a.dueAt) x.late++;
            else x.onTime++;
          }
          if (state === "overdue") x.missing++;
          if (state === "returned") x.returned++;
        }
        m.set(studentId, x);
      }
      return m.get(studentId)!;
    },
  };
}

/* ======================= деканат ======================= */

export type GradebookFilter = "debts" | "low" | "attendance" | "homework";

/** Сводная ведомость группы за семестр (по умолчанию — текущий). Чужая группа → null. */
export async function groupGradebook(staff: SessionStaff, groupId: string, sem?: number) {
  const group = await prisma.group.findFirst({ where: { id: groupId, ...groupScope(staff) }, select: { id: true, name: true, course: true, program: { select: { name: true, faculty: { select: { shortName: true } } } } } });
  if (!group) return null;
  const curSem = semesterOf(group.course);
  const semester = sem && sem >= 1 && sem <= curSem ? sem : curSem;
  const [students, att, hw] = await Promise.all([prisma.student.findMany(studentSelect(groupId)), attendanceByStudent(groupId), homeworkByStudent(groupId)]);

  // дисциплины семестра — объединение по всем студентам, по алфавиту
  const courseMap = new Map<string, { id: string; name: string; assessment: string }>();
  for (const s of students) for (const e of s.enrollments) if (e.semester === semester) courseMap.set(e.courseId, e.course);
  const courses = [...courseMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const rows = students.map((s) => {
    const { avg, debts } = history(s.enrollments, curSem);
    const cells = Object.fromEntries(
      courses.map((c) => {
        const e = s.enrollments.find((x) => x.courseId === c.id && x.semester === semester);
        if (!e) return [c.id, null];
        if (semester < curSem) {
          const f = finalOf(e);
          return [c.id, { kind: "final" as const, value: f?.value ?? null }];
        }
        const sc = currentScore(e);
        return [c.id, sc ? { kind: "current" as const, ...sc } : { kind: "current" as const, points: 0, max: 0, ratio: null, forecast: null }];
      }),
    ) as Record<string, null | { kind: "final"; value: string | null } | { kind: "current"; points: number; max: number; ratio: number | null; forecast: Forecast | null }>;
    const a = att.get(s.id) ?? { present: 0, total: 0 };
    const h = hw.of(s.id);
    const low = Object.values(cells).filter((c) => c?.kind === "current" && c.forecast && isBelow(c.forecast)).length;
    return {
      id: s.id,
      name: `${s.lastName} ${s.firstName}`,
      fullName: [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" "),
      avg,
      debts: debts.length,
      debtList: debts,
      low,
      attendance: pct(a.present, a.total),
      homework: { done: h.done, due: h.due, missing: h.missing, returned: h.returned, percent: pct(h.done, h.due) },
      cells,
    };
  });

  return { group, semester, curSem, courses, rows };
}

export function applyFilter<T extends { debts: number; low: number; attendance: number | null; homework: { missing: number; returned: number } }>(rows: T[], f?: GradebookFilter) {
  if (f === "debts") return rows.filter((r) => r.debts > 0);
  if (f === "low") return rows.filter((r) => r.low > 0);
  if (f === "attendance") return rows.filter((r) => r.attendance != null && r.attendance < 80);
  if (f === "homework") return rows.filter((r) => r.homework.missing + r.homework.returned > 0);
  return rows;
}

/** Статистика по всем группам в области доступа сотрудника. */
export async function groupsOverview(staff: SessionStaff) {
  const groups = await prisma.group.findMany({ where: groupScope(staff), orderBy: { name: "asc" }, select: { id: true } });
  const out = [];
  for (const g of groups) {
    const gb = await groupGradebook(staff, g.id);
    if (!gb || !gb.rows.length) continue;
    const r = gb.rows;
    const avgs = r.map((x) => x.avg).filter((x): x is number => x != null);
    const attended = r.map((x) => x.attendance).filter((x): x is number => x != null);
    const hwDone = r.reduce((a, x) => a + x.homework.done, 0);
    const hwDue = r.reduce((a, x) => a + x.homework.due, 0);
    out.push({
      id: gb.group.id,
      name: gb.group.name,
      course: gb.group.course,
      program: gb.group.program.name,
      students: r.length,
      avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null,
      successful: pct(r.filter((x) => x.debts === 0 && x.low === 0).length, r.length),
      debts: r.reduce((a, x) => a + x.debts, 0),
      attendance: attended.length ? Math.round(attended.reduce((a, b) => a + b, 0) / attended.length) : null,
      homework: pct(hwDone, hwDue),
      needAttention: r.filter((x) => x.debts > 0 || x.low > 0 || (x.attendance != null && x.attendance < 80) || x.homework.missing + x.homework.returned > 0).length,
    });
  }
  return out;
}

/** Личное дело студента для деканата. Студент вне области доступа → null. */
export async function studentFile(staff: SessionStaff, studentId: string) {
  const s = await prisma.student.findFirst({
    where: { id: studentId, ...(staff.facultyId ? { facultyId: staff.facultyId } : {}) },
    include: {
      user: { select: { login: true } },
      group: { select: { id: true, name: true, course: true } },
      faculty: { select: { name: true } },
      program: { select: { name: true, code: true } },
      enrollments: { include: { course: { select: { id: true, name: true, assessment: true } }, grades: { orderBy: { date: "asc" } } }, orderBy: [{ semester: "desc" }] },
      requests: { include: { type: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
      attendance: { select: { present: true, lesson: { select: { date: true, startTime: true, course: { select: { id: true, name: true } } } } }, orderBy: { lesson: { date: "desc" } } },
      submissions: { select: { assignmentId: true, status: true, submittedAt: true } },
    },
  });
  if (!s) return null;
  const curSem = semesterOf(s.course);
  const { avg, debts } = history(s.enrollments, curSem);
  const assignments = await prisma.assignment.findMany({ where: { groupId: s.groupId }, orderBy: { dueAt: "desc" }, select: { id: true, title: true, dueAt: true, course: { select: { name: true } } } });
  const now = new Date();
  const homework = assignments.map((a) => {
    const sub = s.submissions.find((x) => x.assignmentId === a.id);
    return { ...a, state: homeworkState(a.dueAt, sub?.status, now), submittedAt: sub?.submittedAt ?? null };
  });
  const byCourse = new Map<string, { name: string; present: number; total: number }>();
  for (const r of s.attendance) {
    const c = byCourse.get(r.lesson.course.id) ?? { name: r.lesson.course.name, present: 0, total: 0 };
    c.total++;
    if (r.present) c.present++;
    byCourse.set(r.lesson.course.id, c);
  }
  const present = s.attendance.filter((r) => r.present).length;
  const semesters = [...new Set(s.enrollments.map((e) => e.semester))].sort((a, b) => b - a);
  return {
    student: s,
    curSem,
    avg,
    debts,
    semesters: semesters.map((sem) => ({
      semester: sem,
      current: sem === curSem,
      items: s.enrollments.filter((e) => e.semester === sem).map((e) => ({ course: e.course, score: sem === curSem ? currentScore(e) : null, final: sem < curSem ? (finalOf(e)?.value ?? null) : null })),
    })),
    attendance: { percent: pct(present, s.attendance.length), total: s.attendance.length, absent: s.attendance.length - present, byCourse: [...byCourse.values()].map((c) => ({ ...c, percent: pct(c.present, c.total) })), recentAbsences: s.attendance.filter((r) => !r.present).slice(0, 8).map((r) => r.lesson) },
    homework,
  };
}

/* ======================= преподаватель ======================= */

/** Статистика дисциплины в группе + строки по студентам. Чужая пара → null. */
export async function courseStats(teacher: SessionTeacher, groupId: string, courseId: string) {
  if (!(await teachesPair(teacher, groupId, courseId))) return null;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { course: true } });
  if (!group) return null;
  const semester = semesterOf(group.course);
  const [students, att, hw] = await Promise.all([
    prisma.student.findMany({
      where: { groupId, enrollments: { some: { courseId, semester } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, lastName: true, firstName: true, enrollments: { where: { courseId, semester }, select: { id: true, semester: true, courseId: true, course: { select: { id: true, name: true, assessment: true } }, grades: { select: { kind: true, value: true, points: true, date: true } } } } },
    }),
    attendanceByStudent(groupId, courseId),
    homeworkByStudent(groupId, courseId),
  ]);
  const rows = students.map((s) => {
    const sc = s.enrollments[0] ? currentScore(s.enrollments[0]) : null;
    const a = att.get(s.id) ?? { present: 0, total: 0 };
    const h = hw.of(s.id);
    return { id: s.id, name: `${s.lastName} ${s.firstName}`, score: sc, attendance: pct(a.present, a.total), homework: h };
  });
  const scored = rows.filter((r) => r.score);
  const dist: Record<string, number> = {};
  for (const r of scored) dist[r.score!.forecast] = (dist[r.score!.forecast] ?? 0) + 1;
  const atts = rows.map((r) => r.attendance).filter((x): x is number => x != null);
  const pastDue = hw.assignments.filter((a) => a.dueAt < new Date()).length;
  return {
    rows,
    avgRatio: scored.length ? scored.reduce((a, r) => a + r.score!.ratio, 0) / scored.length : null,
    distribution: dist,
    below: scored.filter((r) => isBelow(r.score!.forecast)).length,
    attendance: atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : null,
    homework: {
      assignments: hw.assignments.length,
      onTime: rows.reduce((a, r) => a + r.homework.onTime, 0),
      late: rows.reduce((a, r) => a + r.homework.late, 0),
      missing: rows.reduce((a, r) => a + r.homework.missing, 0),
      pastDue,
    },
  };
}

/** Карточка студента в разрезе одной дисциплины преподавателя. Студент не из этой группы или чужая пара → null. */
export async function teacherStudentCard(teacher: SessionTeacher, groupId: string, courseId: string, studentId: string) {
  if (!(await teachesPair(teacher, groupId, courseId))) return null;
  const s = await prisma.student.findFirst({
    where: { id: studentId, groupId },
    select: {
      id: true, userId: true, lastName: true, firstName: true, middleName: true, subgroup: true, group: { select: { name: true, course: true } },
      enrollments: { where: { courseId }, orderBy: { semester: "desc" }, take: 1, select: { id: true, semester: true, courseId: true, course: { select: { id: true, name: true, assessment: true } }, grades: { orderBy: { date: "asc" }, select: { kind: true, value: true, points: true, date: true, note: true } } } },
      attendance: { where: { lesson: { courseId } }, orderBy: { lesson: { date: "desc" } }, select: { present: true, lesson: { select: { date: true, startTime: true, kind: true } } } },
      submissions: { where: { assignment: { courseId, groupId } }, select: { assignmentId: true, status: true, submittedAt: true } },
    },
  });
  if (!s) return null;
  const assignments = await prisma.assignment.findMany({ where: { groupId, courseId }, orderBy: { dueAt: "desc" }, select: { id: true, title: true, dueAt: true } });
  const now = new Date();
  const e = s.enrollments[0];
  const present = s.attendance.filter((a) => a.present).length;
  return {
    student: s,
    score: e ? currentScore(e) : null,
    grades: e?.grades.filter((g) => g.kind !== "FINAL" && g.kind !== "RETAKE") ?? [],
    attendance: { percent: pct(present, s.attendance.length), list: s.attendance },
    homework: assignments.map((a) => {
      const sub = s.submissions.find((x) => x.assignmentId === a.id);
      return { ...a, state: homeworkState(a.dueAt, sub?.status, now), submittedAt: sub?.submittedAt ?? null };
    }),
  };
}

/** Сводка по всем дисциплинам преподавателя — для главной. */
export async function teacherOverview(teacher: SessionTeacher) {
  const pairs = await prisma.lesson.findMany({ where: { teacherId: teacher.id }, distinct: ["groupId", "courseId"], select: { groupId: true, courseId: true, group: { select: { name: true } }, course: { select: { name: true } } } });
  const out = [];
  for (const p of pairs) {
    const st = await courseStats(teacher, p.groupId, p.courseId);
    if (!st) continue;
    // пропуски подряд: две последние отмеченные пары этой дисциплины — «нет»
    const recent = await prisma.attendance.findMany({ where: { lesson: { groupId: p.groupId, courseId: p.courseId, teacherId: teacher.id } }, orderBy: { lesson: { date: "desc" } }, select: { studentId: true, present: true, lessonId: true } });
    const byStudent = new Map<string, boolean[]>();
    for (const r of recent) {
      const arr = byStudent.get(r.studentId) ?? [];
      if (arr.length < 2) arr.push(r.present);
      byStudent.set(r.studentId, arr);
    }
    const streak = [...byStudent.values()].filter((a) => a.length === 2 && a.every((x) => !x)).length;
    out.push({ groupId: p.groupId, courseId: p.courseId, group: p.group.name, course: p.course.name, avgRatio: st.avgRatio, below: st.below, attendance: st.attendance, streak, missing: st.homework.missing });
  }
  return out.sort((a, b) => b.below + b.streak - (a.below + a.streak));
}
