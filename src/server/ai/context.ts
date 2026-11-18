import "server-only";
import { currentSemester, getAttendance, getEnrollments, getExams, getLessons, listDeadlines, listRequests, summarize, type SessionStudent } from "../repos/student";
import { listHomework } from "../repos/homework";
import { currentScore } from "../repos/analytics";
import { prisma } from "../db";
import { addDays, fmtDateTime, fmtDay, moscowToday } from "@/lib/utils";
import { requestStatusLabel } from "@/lib/labels";
import { forecastLabel } from "@/lib/grading";

/**
 * Контекст для ИИ: только данные текущего студента (через репозитории со studentId из сессии).
 * Модель не имеет доступа к базе — видит лишь этот текст.
 */
export async function buildStudentContext(s: SessionStudent) {
  const today = moscowToday();
  const [profile, lessons, enrollments, exams, requests, deadlines, homework, attendance, att] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: s.id }, include: { group: true, faculty: true, program: true } }),
    getLessons(s, today, addDays(today, 7)),
    getEnrollments(s),
    getExams(s),
    listRequests(s),
    listDeadlines(s, 14),
    listHomework(s),
    getAttendance(s),
    prisma.attendance.findMany({ where: { studentId: s.id }, select: { present: true, lesson: { select: { course: { select: { id: true, name: true } } } } } }),
  ]);
  const { avg, debts, risky } = summarize(enrollments, currentSemester(s));
  const retakes = exams.filter((e) => e.kind === "RETAKE" && e.date > new Date());
  // успеваемость текущего семестра — теми же правилами, что в «Учёбе» и у деканата
  const scores = enrollments.filter((e) => e.semester === currentSemester(s)).map((e) => ({ course: e.course.name, courseId: e.courseId, score: currentScore(e) }));
  const byCourse = new Map<string, { name: string; present: number; total: number }>();
  for (const a of att) {
    const x = byCourse.get(a.lesson.course.id) ?? { name: a.lesson.course.name, present: 0, total: 0 };
    x.total++;
    if (a.present) x.present++;
    byCourse.set(a.lesson.course.id, x);
  }
  const openHomework = homework.filter((h) => h.state !== "accepted" && h.groupId === s.groupId);

  const lines: string[] = [];
  lines.push(`Студент: ${profile.firstName} ${profile.lastName}, ${profile.course} курс, группа ${profile.group.name} (подгруппа ${profile.subgroup}), ${profile.faculty.name}, ${profile.program.code} ${profile.program.name}.`);
  lines.push(`Сегодня: ${fmtDay(today)}.`);
  lines.push(`Средний балл: ${avg ? avg.toFixed(2) : "нет"}. Долги: ${debts.length ? debts.map((d) => `${d.course} (${d.semester} сем.)`).join(", ") : "нет"}.`);
  if (risky.length) lines.push(`Низкие баллы в текущем семестре: ${risky.map((r) => r.enrollment.course.name).join(", ")}.`);
  if (retakes.length) lines.push(`Назначенные пересдачи: ${retakes.map((e) => `${e.course.name} — ${fmtDateTime(e.date)}, ауд. ${e.room}`).join("; ")}.`);
  lines.push("Расписание на 7 дней:");
  for (const l of lessons) {
    const st = l.status === "CANCELLED" ? " [ОТМЕНЕНО]" : l.status === "MOVED" ? ` [ИЗМЕНЕНО: ${l.changeNote ?? ""}]` : "";
    lines.push(`- ${fmtDay(l.date)} ${l.startTime}–${l.endTime}: ${l.course.name}, ауд. ${l.room} (${l.building}), ${l.teacher.fullName}${st}`);
  }
  if (!lessons.length) lines.push("- занятий нет");
  lines.push(`Заявки: ${requests.length ? requests.slice(0, 8).map((r) => `№${r.number} «${r.type.title}» — ${requestStatusLabel[r.status]}`).join("; ") : "нет"}.`);
  lines.push(`Баллы текущего семестра: ${scores.map((x) => `${x.course} — ${x.score ? `${x.score.points}/${x.score.max}, прогноз ${forecastLabel(x.score.forecast)}` : "оценок нет"}`).join("; ") || "нет"}.`);
  lines.push(`Посещаемость: ${attendance.percent != null ? `${attendance.percent} %` : "отметок нет"}, пропусков ${attendance.total - attendance.present}.`);
  lines.push(`Домашние задания (не принятые; в скобках id): ${openHomework.map((h) => `[${h.id}] «${h.title}» (${h.course.name}) — до ${fmtDateTime(h.dueAt)}, статус ${h.state}`).join("; ") || "нет"}.`);
  lines.push(`Ближайшие дедлайны: ${deadlines.length ? deadlines.map((d) => `${d.title} — до ${fmtDateTime(d.dueAt)}`).join("; ") : "нет"}.`);
  return { text: lines.join("\n"), debts, lessons, retakes, deadlines, firstName: profile.firstName, homework, openHomework, scores, attendance, attendanceByCourse: [...byCourse.values()] };
}
export type StudentContext = Awaited<ReturnType<typeof buildStudentContext>>;
