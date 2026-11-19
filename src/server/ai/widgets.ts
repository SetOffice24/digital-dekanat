import "server-only";
/**
 * Данные мини-разделов в чате помощника. Всегда загружаются заново (актуальные) и только в области пользователя:
 * те же репозитории, что и обычные страницы. Чужой тип (не своей роли) или чужой объект → null.
 */
import type { User, Student, Teacher, Staff } from "@prisma/client";
import { prisma } from "../db";
import { addDays, dueDate, fmtDateTime, fmtDay, moscowTime, moscowToday, parseIsoDate } from "@/lib/utils";
import { unreadConversations, viewerOf } from "../repos/messages";
import { forecastLabel, isBelow } from "@/lib/grading";
import { requestStatusLabel } from "@/lib/labels";
import { currentSemester, getAttendance, getEnrollments, getLessons, listRequests as studentRequests, summarize } from "../repos/student";
import { listHomework } from "../repos/homework";
import { currentScore } from "../repos/analytics";
import { currentPeriod, getLessonAttendance } from "../repos/teacher";
import { listLessons, listRequests as staffRequests } from "../repos/staff";
import { photoQueue } from "../repos/photos";
import { accountsOverview } from "../repos/accounts";
import { ACCEPT, MAX_FILE_MB, MAX_FILES } from "../files";

type U = User & { student: Student | null; teacher: Teacher | null; staff: Staff | null };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (s: string | undefined) => parseIsoDate(s ?? "") ?? moscowToday();
const HW: Record<string, string> = { todo: "не сдано", overdue: "просрочено", submitted: "на проверке", returned: "на доработке", accepted: "принято" };

export async function loadWidget(user: U, type: string, p: Record<string, string>) {
  const [role] = type.split(".");
  if (role === "any") return loadAny(user, type);
  if ((role === "student" && !user.student) || (role === "teacher" && !user.teacher) || (role === "staff" && !user.staff)) return null;

  /* ---------- студент ---------- */
  if (type === "student.schedule" && user.student) {
    const day = dayOf(p.date);
    const lessons = await getLessons(user.student, day, addDays(day, 1));
    return {
      date: iso(day), title: fmtDay(day), prev: iso(addDays(day, -1)), next: iso(addDays(day, 1)), today: iso(moscowToday()),
      lessons: lessons.map((l) => ({ id: l.id, start: l.startTime, end: l.endTime, course: l.course.name, room: l.room, building: l.building, teacher: l.teacher.fullName, status: l.status, note: l.changeNote })),
    };
  }
  if (type === "student.grades" && user.student) {
    const enr = await getEnrollments(user.student);
    const sem = currentSemester(user.student);
    const { debts } = summarize(enr, sem);
    return {
      semester: sem,
      rows: enr.filter((e) => e.semester === sem).map((e) => {
        const s = currentScore(e);
        return { course: e.course.name, points: s?.points ?? null, max: s?.max ?? null, ratio: s?.ratio ?? null, forecast: s ? forecastLabel(s.forecast) : null, low: s ? isBelow(s.forecast) : false };
      }),
      debts: debts.map((d) => `${d.course} (${d.semester} сем.)`),
    };
  }
  if (type === "student.homework" && user.student) {
    const rows = await listHomework(user.student);
    const order = { overdue: 0, returned: 1, todo: 2, submitted: 3, accepted: 4 } as const;
    return {
      accept: ACCEPT, maxFiles: MAX_FILES, maxMb: MAX_FILE_MB,
      items: rows
        .filter((h) => h.state !== "accepted" && h.groupId === user.student!.groupId)
        .sort((a, b) => order[a.state] - order[b.state] || a.dueAt.getTime() - b.dueAt.getTime())
        .map((h) => ({ id: h.id, title: h.title, course: h.course.name, due: fmtDateTime(h.dueAt), state: h.state, label: HW[h.state] })),
    };
  }
  if (type === "student.attendance" && user.student) {
    const a = await getAttendance(user.student);
    const rows = await prisma.attendance.findMany({ where: { studentId: user.student.id }, select: { present: true, lesson: { select: { course: { select: { id: true, name: true } } } } } });
    const by = new Map<string, { name: string; present: number; total: number }>();
    for (const r of rows) {
      const x = by.get(r.lesson.course.id) ?? { name: r.lesson.course.name, present: 0, total: 0 };
      x.total++;
      if (r.present) x.present++;
      by.set(r.lesson.course.id, x);
    }
    return { percent: a.percent, present: a.present, total: a.total, courses: [...by.values()].sort((x, y) => x.present / x.total - y.present / y.total), recent: a.absences.slice(0, 5).map((l) => `${fmtDay(l.date)}, ${l.startTime} — ${l.course.name}`) };
  }
  if (type === "student.requests" && user.student) {
    const rows = await studentRequests(user.student);
    return { items: rows.slice(0, 10).map((r) => ({ id: r.id, number: r.number, title: r.type.title, status: requestStatusLabel[r.status], done: r.status === "DONE" || r.status === "READY", attention: r.status === "NEED_INFO", hasPdf: Boolean(r.certificate) })) };
  }

  /* ---------- преподаватель ---------- */
  if (type === "teacher.day" && user.teacher) {
    const day = dayOf(p.date);
    const lessons = await prisma.lesson.findMany({
      where: { teacherId: user.teacher.id, date: day },
      orderBy: { startTime: "asc" },
      select: { id: true, startTime: true, endTime: true, room: true, status: true, subgroup: true, changeNote: true, group: { select: { name: true } }, course: { select: { name: true } }, _count: { select: { attendance: true } } },
    });
    const canMark = day.getTime() <= moscowToday().getTime();
    return {
      date: iso(day), title: fmtDay(day), prev: iso(addDays(day, -1)), next: iso(addDays(day, 1)), today: iso(moscowToday()),
      lessons: lessons.map((l) => ({ id: l.id, start: l.startTime, end: l.endTime, room: l.room, status: l.status, note: l.changeNote, group: l.group.name + (l.subgroup ? ` (${l.subgroup} подгр.)` : ""), course: l.course.name, marked: l._count.attendance > 0, canMark: canMark && l.status !== "CANCELLED" })),
    };
  }
  if (type === "teacher.attendance" && user.teacher) {
    const data = await getLessonAttendance(user.teacher, p.lessonId ?? "");
    if (!data) return null;
    const l = data.lesson;
    return {
      lessonId: l.id, title: `${l.course.name} · ${l.group.name}`, when: `${fmtDay(l.date)}, ${l.startTime}–${l.endTime}, ауд. ${l.room}`,
      canMark: l.status !== "CANCELLED" && l.date.getTime() <= moscowToday().getTime(),
      cancelled: l.status === "CANCELLED", marked: data.marked,
      students: data.students.map((s) => ({ id: s.id, name: `${s.lastName} ${s.firstName}`, present: s.present })),
    };
  }
  if (type === "teacher.reviews" && user.teacher) {
    const subs = await prisma.submission.findMany({
      where: { status: "SUBMITTED", assignment: { teacherId: user.teacher.id, ...{ group: { lessons: { some: { teacherId: user.teacher.id, ...currentPeriod() } } } } } },
      orderBy: { submittedAt: "asc" },
      take: 12,
      select: { id: true, version: true, comment: true, submittedAt: true, student: { select: { lastName: true, firstName: true } }, files: { select: { id: true, name: true } }, assignment: { select: { title: true, dueAt: true, group: { select: { name: true } } } } },
    });
    return { items: subs.map((s) => ({ id: s.id, version: s.version, student: `${s.student.lastName} ${s.student.firstName}`, assignment: s.assignment.title, group: s.assignment.group.name, when: fmtDateTime(s.submittedAt), late: s.submittedAt > s.assignment.dueAt, comment: s.comment, files: s.files })) };
  }

  /* ---------- деканат ---------- */
  if (type === "staff.inbox" && user.staff) {
    const status = p.status === "IN_REVIEW" || p.status === "READY" ? p.status : "NEW";
    const rows = (await staffRequests(user.staff, { status })).slice(0, 12);
    return {
      status,
      items: rows.map((r) => ({
        id: r.id, number: r.number, title: r.type.title, student: `${r.student.lastName} ${r.student.firstName}`, group: r.student.group.name, when: fmtDateTime(r.createdAt),
        action: r.status === "NEW" ? { to: "IN_REVIEW", label: "Взять в работу" } : r.status === "IN_REVIEW" && r.type.isCertificate ? { to: "READY", label: "Справка готова" } : r.status === "READY" ? { to: "DONE", label: "Выдана" } : null,
      })),
    };
  }
  if (type === "staff.groupday" && user.staff) {
    const day = dayOf(p.date);
    const lessons = await listLessons(user.staff, p.groupId ?? "", day);
    const group = await prisma.group.findUnique({ where: { id: p.groupId ?? "" }, select: { id: true, name: true } });
    if (!group) return null;
    return {
      groupId: group.id, group: group.name, date: iso(day), title: fmtDay(day), prev: iso(addDays(day, -1)), next: iso(addDays(day, 1)),
      future: day.getTime() >= moscowToday().getTime(),
      lessons: lessons.map((l) => ({ id: l.id, start: l.startTime, end: l.endTime, course: l.course.name, teacher: l.teacher.fullName, room: l.room, status: l.status, note: l.changeNote, subgroup: l.subgroup })),
    };
  }
  if (type === "staff.photos" && user.staff) {
    const q = await photoQueue(user.staff);
    return { items: q.slice(0, 6).map((x) => ({ id: x.id, student: `${x.student.lastName} ${x.student.firstName}`, studentId: x.student.id, group: x.student.group.name, replaces: x.student.photos.length > 0 })) };
  }
  /* ---------- сводка «на сегодня» (первый экран помощника) ---------- */
  if (type === "student.today" && user.student) {
    const today = moscowToday();
    const now = moscowTime();
    const soon = addDays(new Date(), 3);
    const [lessons, hw, needInfo, unread] = await Promise.all([
      getLessons(user.student, today, addDays(today, 1)),
      listHomework(user.student),
      prisma.request.findMany({ where: { studentId: user.student.id, status: "NEED_INFO" }, select: { id: true, number: true, type: { select: { title: true } } } }),
      unreadConversations(viewerOf(user)),
    ]);
    return {
      title: fmtDay(today),
      lessons: lessons.map((l) => ({ id: l.id, start: l.startTime, course: l.course.name, room: l.room, status: l.status, past: l.endTime < now })),
      homework: hw
        .filter((h) => h.groupId === user.student!.groupId && (h.state === "overdue" || h.state === "returned" || (h.state === "todo" && h.dueAt < soon)))
        .slice(0, 3)
        .map((h) => ({ id: h.id, title: h.title, due: fmtDateTime(h.dueAt), state: h.state, label: HW[h.state] })),
      needInfo: needInfo.map((r) => ({ id: r.id, title: `№${r.number} ${r.type.title}` })),
      unread,
      reminders: await todaysReminders(user.id),
    };
  }
  if (type === "teacher.today" && user.teacher) {
    const today = moscowToday();
    const now = moscowTime();
    const [lessons, pending, unread] = await Promise.all([
      prisma.lesson.findMany({
        where: { teacherId: user.teacher.id, date: today },
        orderBy: { startTime: "asc" },
        select: { id: true, startTime: true, endTime: true, room: true, status: true, group: { select: { name: true } }, course: { select: { name: true } }, _count: { select: { attendance: true } } },
      }),
      prisma.submission.count({ where: { status: "SUBMITTED", assignment: { teacherId: user.teacher.id } } }),
      unreadConversations(viewerOf(user)),
    ]);
    return {
      title: fmtDay(today),
      lessons: lessons.map((l) => ({ id: l.id, start: l.startTime, course: l.course.name, group: l.group.name, room: l.room, status: l.status, past: l.endTime < now, started: l.startTime <= now, marked: l._count.attendance > 0 })),
      pending,
      unread,
      reminders: await todaysReminders(user.id),
    };
  }
  if (type === "staff.today" && user.staff) {
    const today = moscowToday();
    const fac = user.staff.facultyId;
    const scope = fac ? { facultyId: fac } : {};
    const [open, needInfo, photos, unread, changes] = await Promise.all([
      prisma.request.findMany({ where: { status: { in: ["NEW", "IN_REVIEW"] }, student: scope }, select: { status: true, createdAt: true, type: { select: { slaDays: true } } } }),
      prisma.request.count({ where: { status: "NEED_INFO", student: scope } }),
      prisma.studentPhoto.count({ where: { status: "PENDING", student: scope } }),
      unreadConversations(viewerOf(user)),
      prisma.lesson.count({ where: { date: today, status: { not: "SCHEDULED" }, ...(fac ? { group: { program: { facultyId: fac } } } : {}) } }),
    ]);
    const overdue = open.filter((r) => dueDate(r.createdAt, r.type.slaDays) < new Date()).length;
    return { title: fmtDay(today), fresh: open.filter((r) => r.status === "NEW").length, inWork: open.filter((r) => r.status === "IN_REVIEW").length, overdue, needInfo, photos, unread, changes, reminders: await todaysReminders(user.id) };
  }
  if (type === "staff.accounts" && user.staff) {
    const groupId = p.groupId || undefined;
    const { stats, rows } = await accountsOverview(user.staff, { groupId, filter: "never" });
    return { groupId: groupId ?? "", stats, never: rows.slice(0, 8).map((r) => ({ id: r.id, name: `${r.lastName} ${r.firstName}`, group: r.group.name })) };
  }
  return null;
}

/** Мини-разделы для любой роли: напоминания пользователя. */
async function loadAny(user: U, type: string) {
  if (type === "any.reminders") {
    const rows = await prisma.reminder.findMany({ where: { userId: user.id, sentAt: null }, orderBy: { dueAt: "asc" }, take: 20, select: { id: true, text: true, dueAt: true } });
    return { items: rows.map((r) => ({ id: r.id, text: r.text, when: fmtDateTime(r.dueAt) })) };
  }
  return null;
}

/** Напоминания на сегодня — строкой в сводке. */
async function todaysReminders(userId: string) {
  const end = addDays(moscowToday(), 1);
  const rows = await prisma.reminder.findMany({ where: { userId, sentAt: null, dueAt: { lt: new Date(end.getTime() - 3 * 3600_000) } }, orderBy: { dueAt: "asc" }, take: 3, select: { text: true, dueAt: true } });
  return rows.map((r) => ({ text: r.text, when: fmtDateTime(r.dueAt) }));
}
