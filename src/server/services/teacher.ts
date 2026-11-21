import "server-only";
/**
 * Единое окно глазами преподавателя: кто из его студентов отсутствует по уважительной причине
 * (заявления о пропуске и сообщения «я заболел») — чтобы не ставить «н» без разбора и перенести контрольную.
 * Минимизация данных: преподаватель видит только тех, у кого ведёт занятия сейчас (с учётом подгруппы),
 * и только период и состояние. Текст причины из заявления (может содержать медицинские подробности) — только деканату.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { currentPeriod } from "../repos/teacher";
import { addDays, moscowToday } from "@/lib/utils";

/** Студенты, у которых преподаватель ведёт занятия в текущем периоде: вся группа (общие пары) или конкретная подгруппа. */
export async function taughtStudentsWhere(teacherId: string): Promise<Prisma.StudentWhereInput | null> {
  const pairs = await prisma.lesson.findMany({ where: { teacherId, ...currentPeriod() }, distinct: ["groupId", "subgroup"], select: { groupId: true, subgroup: true } });
  if (!pairs.length) return null;
  const whole = [...new Set(pairs.filter((p) => p.subgroup === null).map((p) => p.groupId))];
  const parts = pairs.filter((p) => p.subgroup !== null && !whole.includes(p.groupId));
  return { OR: [...(whole.length ? [{ groupId: { in: whole } }] : []), ...parts.map((p) => ({ groupId: p.groupId, subgroup: p.subgroup as number }))] };
}

export async function absentStudents(teacherId: string) {
  const today = moscowToday();
  const mine = await taughtStudentsWhere(teacherId);
  if (!mine) return [];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(addDays(today, -7));
  const to = iso(addDays(today, 14));
  const rows = await prisma.request.findMany({
    where: { type: { code: "APP_ABSENCE" }, status: { not: "REJECTED" }, student: mine },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, status: true, payload: true, student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } } },
  });
  const absences = rows
    .map((r) => ({ r, p: (r.payload ?? {}) as Record<string, string> }))
    .filter(({ p }) => p.dateFrom && p.dateTo && p.dateTo >= from && p.dateFrom <= to)
    .map(({ r, p }) => ({ key: r.id, name: `${r.student.lastName} ${r.student.firstName}`, group: r.student.group.name, from: p.dateFrom, to: p.dateTo, reason: "Заявление о пропуске", state: r.status === "READY" || r.status === "DONE" ? "подтверждено деканатом" : "на рассмотрении в деканате" }));
  // «я заболел» из единого окна: студент сам предупредил преподавателей (даты — в отметке шага)
  const sick = await prisma.caseStep.findMany({
    where: { key: "teachers", doneAt: { gte: addDays(today, -14) }, case: { code: "sick", status: "OPEN", student: mine } },
    select: { caseId: true, note: true, case: { select: { student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } } } } },
  });
  const notified = sick.map((s) => ({ key: s.caseId, name: `${s.case.student.lastName} ${s.case.student.firstName}`, group: s.case.student.group.name, from: "", to: "", reason: `Сообщил(а) сам(а)${/(\d\d\.\d\d–\d\d\.\d\d)/.exec(s.note ?? "")?.[1] ? `, ${/(\d\d\.\d\d–\d\d\.\d\d)/.exec(s.note ?? "")?.[1]}` : ""}`, state: "заявление ещё не подано" }));
  const names = new Set(absences.map((a) => a.name));
  return [...absences, ...notified.filter((n) => !names.has(n.name))];
}
