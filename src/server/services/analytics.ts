import "server-only";
/**
 * Аналитика единого окна для руководства: какие услуги заказывают, укладывается ли деканат в срок,
 * как оценивают студенты, сколько выдано автоматически, какие ситуации проходят. Основа для решений —
 * что автоматизировать следующим, где не хватает людей. Деканат факультета видит своих студентов, деканат вуза — всех.
 */
import type { Prisma, RequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { studentScope, type SessionStaff } from "../repos/staff";
import { situations } from "@/config/situations";
import { moscowToday, addDays } from "@/lib/utils";

const FINAL: RequestStatus[] = ["READY", "DONE", "REJECTED"];
const DAY = 86400000;


export async function servicesOverview(staff: SessionStaff, days = 30) {
  const since = addDays(new Date(), -days);
  const where: Prisma.RequestWhereInput = { student: studentScope(staff) };
  const [rows, types, openNow] = await Promise.all([
    prisma.request.findMany({
      where: { ...where, createdAt: { gte: since } },
      select: { id: true, typeId: true, status: true, createdAt: true, dueAt: true, autoIssued: true, rating: true, events: { where: { toStatus: { in: FINAL } }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } },
    }),
    prisma.requestType.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] }),
    prisma.request.findMany({ where: { ...where, status: { in: ["NEW", "IN_REVIEW"] }, dueAt: { lt: new Date() } }, select: { typeId: true } }),
  ]);
  const stat = (list: typeof rows) => {
    const finished = list.filter((r) => r.events[0]);
    const durations = finished.map((r) => (r.events[0].createdAt.getTime() - r.createdAt.getTime()) / DAY);
    const onTime = finished.filter((r) => !r.dueAt || r.events[0].createdAt <= r.dueAt).length;
    const rated = list.filter((r) => r.rating != null);
    return {
      total: list.length,
      finished: finished.length,
      onTimePct: finished.length ? Math.round((onTime / finished.length) * 100) : null,
      avgDays: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
      auto: list.filter((r) => r.autoIssued).length,
      rating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 10) / 10 : null,
      ratedCount: rated.length,
      open: list.filter((r) => !FINAL.includes(r.status)).length,
    };
  };
  const byType = types.map((t) => ({
    id: t.id, code: t.code, title: t.title, category: t.category, slaDays: t.slaDays, autoIssue: t.autoIssue, enabled: t.enabled, isCertificate: t.isCertificate,
    overdueNow: openNow.filter((r) => r.typeId === t.id).length,
    ...stat(rows.filter((r) => r.typeId === t.id)),
  }));
  const totals = { ...stat(rows), overdueNow: openNow.length, savedHours: Math.round((rows.filter((r) => r.autoIssued).length * 15) / 60) };
  return { days, totals, byType };
}

/** Низкие оценки с комментариями — что улучшать. */
export function lowRatings(staff: SessionStaff, take = 6) {
  const where: Prisma.RequestWhereInput = { student: studentScope(staff) };
  return prisma.request.findMany({ where: { ...where, rating: { lte: 3 } }, orderBy: { ratedAt: "desc" }, take, select: { id: true, number: true, rating: true, ratingComment: true, ratedAt: true, type: { select: { title: true } } } });
}

/** Журнал автоматически выданных справок (деканат может отозвать). */
export function autoIssued(staff: SessionStaff, take = 10) {
  return prisma.request.findMany({ where: { student: studentScope(staff), autoIssued: true }, orderBy: { createdAt: "desc" }, take, select: { id: true, number: true, createdAt: true, type: { select: { title: true } }, certificate: { select: { revoked: true, revokeReason: true } }, student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } } } });
}

/** Ситуации: сколько начали и завершили за период. */
export async function situationStats(staff: SessionStaff, days = 30) {
  const rows = await prisma.situationCase.groupBy({ by: ["code", "status"], where: { createdAt: { gte: addDays(new Date(), -days) }, student: studentScope(staff) }, _count: { _all: true } });
  return situations.map((s) => {
    const of = rows.filter((r) => r.code === s.code);
    const n = (st: string) => of.filter((r) => r.status === st).reduce((a, r) => a + r._count._all, 0);
    return { code: s.code, title: s.title, started: of.reduce((a, r) => a + r._count._all, 0), done: n("DONE"), open: n("OPEN") };
  });
}

/** Приём: сегодня и неявки за период. */
export async function appointmentStats(staff: SessionStaff, days = 30) {
  const where: Prisma.AppointmentWhereInput = { student: studentScope(staff) };
  const today = moscowToday();
  const [todayCount, past] = await Promise.all([
    prisma.appointment.count({ where: { ...where, status: "BOOKED", startsAt: { gte: new Date(today.getTime() - 3 * 3600_000), lt: new Date(today.getTime() + 21 * 3600_000) } } }),
    prisma.appointment.groupBy({ by: ["status"], where: { ...where, startsAt: { gte: addDays(new Date(), -days), lt: new Date() } }, _count: { _all: true } }),
  ]);
  const n = (st: string) => past.find((p) => p.status === st)?._count._all ?? 0;
  const held = n("DONE") + n("NO_SHOW");
  return { today: todayCount, noShowPct: held ? Math.round((n("NO_SHOW") / held) * 100) : null, held };
}

export class SettingsError extends Error {}

/** Настройки услуги (срок, автовыдача, доступность) — только деканат уровня вуза (без привязки к факультету). */
export async function updateServiceSettings(staff: SessionStaff, typeId: string, s: { slaDays: number; autoIssue: boolean; enabled: boolean }) {
  if (staff.facultyId) throw new SettingsError("Настройки услуг меняет деканат уровня вуза");
  if (!Number.isInteger(s.slaDays) || s.slaDays < 1 || s.slaDays > 30) throw new SettingsError("Срок — от 1 до 30 рабочих дней");
  const t = await prisma.requestType.findUnique({ where: { id: typeId }, select: { isCertificate: true, route: true } });
  if (!t) return false;
  const hasRoute = Array.isArray(t.route) && t.route.length > 0;
  if (s.autoIssue && (!t.isCertificate || hasRoute)) throw new SettingsError("Автоматически выдаются только справки без согласования");
  await prisma.requestType.update({ where: { id: typeId }, data: { slaDays: s.slaDays, autoIssue: s.autoIssue, enabled: s.enabled } });
  return true;
}
