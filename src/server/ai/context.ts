import "server-only";
import { currentSemester, getEnrollments, getExams, getLessons, listDeadlines, listRequests, summarize, type SessionStudent } from "../repos/student";
import { prisma } from "../db";
import { addDays, fmtDateTime, fmtDay, moscowToday } from "@/lib/utils";
import { requestStatusLabel } from "@/lib/labels";

/**
 * Контекст для ИИ: только данные текущего студента (через репозитории со studentId из сессии).
 * Модель не имеет доступа к базе — видит лишь этот текст.
 */
export async function buildStudentContext(s: SessionStudent) {
  const today = moscowToday();
  const [profile, lessons, enrollments, exams, requests, deadlines] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: s.id }, include: { group: true, faculty: true, program: true } }),
    getLessons(s, today, addDays(today, 7)),
    getEnrollments(s),
    getExams(s),
    listRequests(s),
    listDeadlines(s, 14),
  ]);
  const { avg, debts, risky } = summarize(enrollments, currentSemester(s));
  const retakes = exams.filter((e) => e.kind === "RETAKE" && e.date > new Date());

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
  lines.push(`Ближайшие дедлайны: ${deadlines.length ? deadlines.map((d) => `${d.title} — до ${fmtDateTime(d.dueAt)}`).join("; ") : "нет"}.`);
  return { text: lines.join("\n"), debts, lessons, retakes, deadlines, firstName: profile.firstName };
}
export type StudentContext = Awaited<ReturnType<typeof buildStudentContext>>;
