import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "Europe/Moscow";

/** Сегодняшняя дата по Москве как UTC-полночь (так хранятся даты занятий). */
export function moscowToday(base = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
  return new Date(parts + "T00:00:00Z");
}

/** Текущее время по Москве в формате HH:MM */
export function moscowTime(base = new Date()): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(base);
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export function mondayOf(d: Date) {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shortFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" });
const weekdayShort = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" });

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDay = (d: Date) => capitalize(dayFmt.format(d));
export const fmtShort = (d: Date) => shortFmt.format(d).replace(".", "");
export const fmtWeekdayShort = (d: Date) => weekdayShort.format(d);

export function fmtDateTime(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function relativeTime(d: Date, base = new Date()) {
  const diff = (base.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`;
  return fmtDate(d);
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** «301» → «ауд. 301»; «Лаб. 3», «А-1» и прочие названия — без приставки. */
export function roomLabel(room: string) {
  return /^\d/.test(room) ? `ауд. ${room}` : room;
}

/** Срок заявки: дата подачи + N рабочих дней (сб и вс не считаются). Один расчёт для студента и деканата. */
export function dueDate(createdAt: Date, slaDays: number) {
  const d = new Date(createdAt);
  let left = slaDays;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}
