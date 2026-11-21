import "server-only";
/**
 * Единое окно глазами преподавателя: кто из его студентов отсутствует по уважительной причине
 * (заявления о пропуске и сообщения «я заболел») — чтобы не ставить «н» без разбора и перенести контрольную.
 */
import { prisma } from "../db";
import { currentPeriod } from "../repos/teacher";
import { addDays, moscowToday } from "@/lib/utils";

export async function absentStudents(teacherId: string) {
  const today = moscowToday();
  const groups = await prisma.lesson.findMany({ where: { teacherId, ...currentPeriod() }, distinct: ["groupId"], select: { groupId: true } });
  const groupIds = groups.map((g) => g.groupId);
  if (!groupIds.length) return [];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(addDays(today, -7));
  const to = iso(addDays(today, 14));
  const rows = await prisma.request.findMany({
    where: { type: { code: "APP_ABSENCE" }, status: { not: "REJECTED" }, student: { groupId: { in: groupIds } } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, status: true, payload: true, student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } } },
  });
  const absences = rows
    .map((r) => ({ r, p: (r.payload ?? {}) as Record<string, string> }))
    .filter(({ p }) => p.dateFrom && p.dateTo && p.dateTo >= from && p.dateFrom <= to)
    .map(({ r, p }) => ({ key: r.id, name: `${r.student.lastName} ${r.student.firstName}`, group: r.student.group.name, from: p.dateFrom, to: p.dateTo, reason: p.reason ?? "", state: r.status === "READY" || r.status === "DONE" ? "подтверждено деканатом" : "заявление на рассмотрении" }));
  // «я заболел» из единого окна: студент сам предупредил преподавателей (даты — в отметке шага)
  const sick = await prisma.caseStep.findMany({
    where: { key: "teachers", doneAt: { gte: addDays(today, -14) }, case: { code: "sick", status: "OPEN", student: { groupId: { in: groupIds } } } },
    select: { caseId: true, note: true, case: { select: { student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } } } } },
  });
  const notified = sick.map((s) => ({ key: s.caseId, name: `${s.case.student.lastName} ${s.case.student.firstName}`, group: s.case.student.group.name, from: "", to: "", reason: `Болеет — сообщил(а) сам(а): ${(s.note ?? "").replace(/^\d+ преподавател\S*, /, "")}`, state: "заявление ещё не подано" }));
  const names = new Set(absences.map((a) => a.name));
  return [...absences, ...notified.filter((n) => !names.has(n.name))];
}
