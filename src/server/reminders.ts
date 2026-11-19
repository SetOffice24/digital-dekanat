import "server-only";
/**
 * Напоминания, поставленные через помощника. В срок — уведомление в колокольчике и push на устройства.
 * Доставка: фоновый таймер сервера раз в минуту (src/instrumentation.ts) и, на всякий случай,
 * при каждом опросе счётчика уведомлений открытым кабинетом. Повторной доставки нет: sentAt ставится условно.
 */
import { prisma } from "./db";
import { notify } from "./notify";
import { addDays, moscowToday, moscowTime } from "@/lib/utils";
import { norm, parseDay } from "./ai/common";

export async function deliverDueReminders(userId?: string) {
  const due = await prisma.reminder.findMany({ where: { sentAt: null, dueAt: { lte: new Date() }, ...(userId ? { userId } : {}) }, take: 100, select: { id: true, userId: true, text: true, link: true } });
  for (const r of due) {
    const { count } = await prisma.reminder.updateMany({ where: { id: r.id, sentAt: null }, data: { sentAt: new Date() } });
    if (!count) continue; // уже доставил другой вызов
    await notify([r.userId], { kind: "SYSTEM", title: "Напоминание", body: r.text, link: r.link ?? undefined, dedupeKey: `reminder:${r.id}` }).catch((e) => console.error("reminder notify failed", e));
  }
  return due.length;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Московское «YYYY-MM-DDTHH:mm» → Date. */
export const fromMoscow = (local: string) => new Date(`${local}:00+03:00`);

/**
 * «Напомни мне завтра в 9 про лабораторную» → текст и срок (московское время).
 * Без времени — 9:00; без дня — сегодня, если время ещё не прошло, иначе завтра; «через 2 часа / 30 минут / полчаса».
 */
export function parseReminder(message: string): { text: string; dueAt: string } {
  const t = norm(message);
  const now = new Date();
  let due: Date | null = null;
  const rel = t.match(/через\s+(\d+|полчаса|час)\s*(минут|мин|час)?/);
  if (rel) {
    const mins = rel[1] === "полчаса" ? 30 : rel[1] === "час" ? 60 : Number(rel[1]) * (rel[2]?.startsWith("час") ? 60 : 1);
    due = new Date(now.getTime() + mins * 60_000);
  } else {
    const time = t.match(/(?:^|\s)(?:в|к|на)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:час|ч\b|утра|вечера|дня))?/);
    let hh = time ? Number(time[1]) : null;
    const mm = time?.[2] ? Number(time[2]) : 0;
    if (hh != null && /вечера|дня/.test(t) && hh < 12) hh += 12;
    const day = parseDay(message);
    if (hh != null && hh <= 23) {
      const base = day ?? moscowToday();
      const local = `${base.toISOString().slice(0, 10)}T${pad(hh)}:${pad(mm)}`;
      due = fromMoscow(local);
      if (!day && due < now) due = fromMoscow(`${addDays(base, 1).toISOString().slice(0, 10)}T${pad(hh)}:${pad(mm)}`);
    } else if (day) {
      due = fromMoscow(`${day.toISOString().slice(0, 10)}T09:00`);
    }
  }
  const dueAt = due ? new Date(due.getTime() + 3 * 3600_000).toISOString().slice(0, 16) : "";
  // о чём: после «про / о / что / :», иначе — фраза без служебного начала
  const about = message.match(/(?:\sпро\s|\sоб?\s|\sчто\s|:\s*)([\s\S]{2,})$/i)?.[1];
  const text = (about ?? message.replace(/^\s*(напомни(те)?|поставь напоминание|напоминание)\s*(мне)?/i, ""))
    .replace(/\s*(завтра|сегодня|послезавтра|через\s+\S+(\s+(минут\S*|час\S*))?|в\s+\d{1,2}([:.]\d{2})?(\s*(утра|вечера|дня))?)\s*/gi, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  return { text: text.slice(0, 200), dueAt };
}

/** Для подсказки «сейчас» в карточке. */
export const nowMoscow = () => `${moscowToday().toISOString().slice(0, 10)}T${moscowTime()}`;
