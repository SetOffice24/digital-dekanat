import "server-only";
/**
 * Запись на приём в деканат: слоты по часам деканата (src/config/services.ts), один студент — один слот.
 * Занятость слота держит уникальный slotKey (время): два человека одно время не займут даже одновременно.
 * Слот занят, пока у записи есть slotKey (освобождает только отмена) — так показ свободных слотов совпадает с уникальным индексом.
 * Квота «не больше двух будущих записей» — под блокировкой по студенту (pg_advisory_xact_lock), параллельные запросы её не обойдут.
 * За час до приёма — напоминание (общая таблица Reminder: уведомление + push), создаётся в той же транзакции, что и запись.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { deanery } from "@/config/services";
import { addDays, fmtDateTime, isoDate, moscowToday } from "@/lib/utils";
import { studentScope, type SessionStaff } from "../repos/staff";

export class AppointmentError extends Error {}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Московское время дня → Date (UTC). */
const at = (day: Date, time: string) => new Date(`${isoDate(day)}T${time}:00+03:00`);
const slotKey = (startsAt: Date) => `DEANERY:${startsAt.toISOString()}`;

/** Слоты деканата на день (без прошедших и без обеда). */
export function slotsOf(day: Date, now = new Date()) {
  if (!deanery.days.includes(day.getUTCDay())) return [];
  const out: Date[] = [];
  for (let m = toMin(deanery.open); m + deanery.slotMinutes <= toMin(deanery.close); m += deanery.slotMinutes) {
    if (deanery.lunch && m < toMin(deanery.lunch[1]) && m + deanery.slotMinutes > toMin(deanery.lunch[0])) continue;
    const t = at(day, hhmm(m));
    if (t.getTime() > now.getTime() + 30 * 60_000) out.push(t); // минимум за полчаса
  }
  return out;
}

/** Ближайшие рабочие дни со свободными слотами. */
export async function availability(days = 10, now = new Date()) {
  const today = moscowToday(now);
  const list: { day: Date; slots: { at: Date; free: boolean }[] }[] = [];
  for (let i = 0; list.length < days && i < days * 2 + 7; i++) {
    const day = addDays(today, i);
    const slots = slotsOf(day, now);
    if (slots.length) list.push({ day, slots: slots.map((s) => ({ at: s, free: true })) });
  }
  if (!list.length) return list;
  const busy = await prisma.appointment.findMany({ where: { slotKey: { not: null }, startsAt: { gte: list[0].slots[0].at, lte: list[list.length - 1].slots.at(-1)!.at } }, select: { startsAt: true } });
  const taken = new Set(busy.map((b) => b.startsAt.getTime()));
  for (const d of list) for (const s of d.slots) s.free = !taken.has(s.at.getTime());
  return list;
}

type ApptStudent = { id: string; userId: string };
const MAX_FUTURE = 2;
const HORIZON_DAYS = 30;

export async function bookAppointment(s: ApptStudent, startsAtIso: string, purpose: string, requestId?: string | null) {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) throw new AppointmentError("Выберите время");
  if (startsAt.getTime() > Date.now() + HORIZON_DAYS * 86400_000) throw new AppointmentError(`Записаться можно не дальше чем на ${HORIZON_DAYS} дней вперёд`);
  if (!slotsOf(moscowToday(startsAt)).some((x) => x.getTime() === startsAt.getTime())) throw new AppointmentError("Это время недоступно — выберите другое");
  const p = purpose.trim().slice(0, 200);
  if (p.length < 3) throw new AppointmentError("Напишите, с чем придёте");
  const req = requestId ? await prisma.request.findFirst({ where: { id: requestId, studentId: s.id }, select: { id: true } }) : null;
  try {
    return await prisma.$transaction(async (tx) => {
      // все записи одного студента — по очереди: проверка квоты и создание не разделены гонкой
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"appt:" + s.id}))`;
      // повтор того же запроса (двойной клик, сетевой повтор) возвращает уже созданную запись
      const same = await tx.appointment.findFirst({ where: { studentId: s.id, startsAt, status: "BOOKED" } });
      if (same) return same;
      const mine = await tx.appointment.count({ where: { studentId: s.id, status: "BOOKED", startsAt: { gt: new Date() } } });
      if (mine >= MAX_FUTURE) throw new AppointmentError("У вас уже две записи — отмените одну, чтобы записаться снова");
      const a = await tx.appointment.create({ data: { studentId: s.id, startsAt, purpose: p, requestId: req?.id ?? null, slotKey: slotKey(startsAt) } });
      const remindAt = new Date(startsAt.getTime() - 60 * 60_000);
      if (remindAt > new Date()) await tx.reminder.create({ data: { userId: s.userId, text: `Приём в деканате: ${fmtDateTime(startsAt)}, ${deanery.room}. ${p}`, dueAt: remindAt, link: "/services/appointments" } });
      return a;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppointmentError("Это время только что заняли — выберите другое");
    throw e;
  }
}

export async function cancelAppointment(s: ApptStudent, id: string) {
  const a = await prisma.appointment.findFirst({ where: { id, studentId: s.id, status: "BOOKED" }, select: { id: true, startsAt: true } });
  if (!a) return false;
  await prisma.$transaction([
    prisma.appointment.update({ where: { id }, data: { status: "CANCELLED", slotKey: null } }),
    // напоминание о приёме больше не нужно
    prisma.reminder.deleteMany({ where: { userId: s.userId, sentAt: null, link: "/services/appointments", dueAt: new Date(a.startsAt.getTime() - 60 * 60_000) } }),
  ]);
  return true;
}

export function myAppointments(studentId: string) {
  return prisma.appointment.findMany({ where: { studentId, startsAt: { gte: addDays(new Date(), -30) } }, orderBy: { startsAt: "desc" }, take: 20, select: { id: true, startsAt: true, purpose: true, status: true, request: { select: { id: true, number: true } } } });
}

/** Приём глазами деканата: студенты своего факультета (деканат вуза — все). */
export function deskAppointments(staff: SessionStaff, from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: { student: studentScope(staff), startsAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, purpose: true, status: true, request: { select: { id: true, number: true, type: { select: { title: true } } } }, student: { select: { id: true, lastName: true, firstName: true, group: { select: { name: true } } } } },
  });
}

/**
 * Отметить приём: пришёл / не пришёл. Только когда приём начался: «пришёл» — с начала слота (или если студент пришёл
 * раньше, но не более чем за 15 минут), «не пришёл» — после начала. Слот при этом остаётся занятым (slotKey не трогаем).
 */
export async function markAppointment(staff: SessionStaff, id: string, status: "DONE" | "NO_SHOW") {
  const now = Date.now();
  const latestStart = new Date(status === "DONE" ? now + 15 * 60_000 : now);
  const { count } = await prisma.appointment.updateMany({ where: { id, student: studentScope(staff), status: { in: ["BOOKED", "DONE", "NO_SHOW"] }, startsAt: { lte: latestStart } }, data: { status } });
  return count > 0;
}
