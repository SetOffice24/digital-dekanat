import "server-only";
import { addDays, moscowToday } from "@/lib/utils";

/** Ссылка-подсказка под ответом помощника («Открыть заявки»). */
export type AiLink = { href: string; label: string };
export type ChatMsg = { role: "user" | "assistant"; content: string };

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
export const hasAny = (m: string, ...w: string[]) => w.some((x) => m.includes(x));

/** Группа из фразы: «ИВТ-24-1», «ивт 24 1», «ивт241» → id из списка. */
export function findGroup<T extends { name: string }>(text: string, groups: T[]): T | undefined {
  const flat = norm(text).replace(/[\s-]/g, "");
  return [...groups].sort((a, b) => b.name.length - a.name.length).find((g) => flat.includes(norm(g.name).replace(/[\s-]/g, "")));
}

/** Основа слова для сравнения названий: «алгоритмам» ~ «алгоритмы», «базам» ~ «базы». */
const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2));
/** Сколько значимых слов названия встречается во фразе (в любом падеже). */
export function mentionScore(text: string, name: string) {
  const words = norm(name).split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 4);
  const t = norm(text);
  return words.filter((w) => t.includes(stem(w))).length;
}
export const mentions = (text: string, name: string) => mentionScore(text, name) > 0;
/** Лучшие совпадения: «по базам данных» → «Базы данных», а не «Алгоритмы и структуры данных». */
export function bestMentions<T>(text: string, items: T[], name: (x: T) => string) {
  const scored = items.map((x) => ({ x, s: mentionScore(text, name(x)) }));
  const max = Math.max(0, ...scored.map((y) => y.s));
  return max ? scored.filter((y) => y.s === max).map((y) => y.x) : [];
}

const WEEKDAYS = ["воскресен", "понедельник", "вторник", "сред", "четверг", "пятниц", "суббот"];
const MONTHS = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];

/** День из фразы (по Москве): сегодня, завтра, послезавтра, «в пятницу», «25 ноября», «25.11». null — не нашли. */
export function parseDay(text: string, today = moscowToday()): Date | null {
  const t = norm(text);
  if (t.includes("послезавтра")) return addDays(today, 2);
  if (t.includes("завтра")) return addDays(today, 1);
  if (t.includes("сегодня")) return today;
  const dm = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : today.getUTCFullYear();
    const d = new Date(Date.UTC(y, Number(dm[2]) - 1, Number(dm[1])));
    return d < today && !dm[3] ? new Date(Date.UTC(y + 1, Number(dm[2]) - 1, Number(dm[1]))) : d;
  }
  const mm = t.match(/(\d{1,2})\s+([а-я]+)/);
  if (mm) {
    const mi = MONTHS.findIndex((m) => mm[2].startsWith(m) && (m !== "ма" || mm[2].startsWith("мая") || mm[2] === "май"));
    if (mi >= 0) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), mi, Number(mm[1])));
      return d < today ? new Date(Date.UTC(today.getUTCFullYear() + 1, mi, Number(mm[1]))) : d;
    }
  }
  const wi = WEEKDAYS.findIndex((w) => t.includes(w));
  if (wi >= 0) {
    const diff = (wi - today.getUTCDay() + 7) % 7 || 7;
    return addDays(today, diff);
  }
  const weeks = t.match(/через\s+(\d+|неделю|две недели)/);
  if (weeks) return addDays(today, weeks[1] === "неделю" ? 7 : weeks[1] === "две недели" ? 14 : Number(weeks[1]));
  return null;
}

/** Срок сдачи: день из фразы (по умолчанию — через неделю) в 23:59 по Москве. */
export function parseDue(text: string) {
  const day = parseDay(text) ?? addDays(moscowToday(), 7);
  const iso = day.toISOString().slice(0, 10);
  const time = norm(text).match(/(?:в|к|до)\s+(\d{1,2})[:.](\d{2})/);
  const hh = time ? time[1].padStart(2, "0") : "23";
  const mi = time ? time[2] : "59";
  return `${iso}T${hh}:${mi}`;
}

/**
 * Модель через шлюз (OpenAI-совместимый). Без ключа — null, и работает режим правил.
 * Модель возвращает JSON {text, draft}; черновик дальше проверяется на сервере и выполняется только по кнопке.
 */
export async function gatewayJson(system: string, history: ChatMsg[]): Promise<{ text: string; draft?: unknown } | null> {
  const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY, model = process.env.AI_MODEL;
  if (process.env.AI_PROVIDER !== "gateway" || !base || !key || !model) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 900, messages: [{ role: "system", content: system }, ...history] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error("AI gateway HTTP", res.status);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return content ? { text: content.slice(0, 3000) } : null;
    const parsed = JSON.parse(json) as { text?: unknown; draft?: unknown };
    return typeof parsed.text === "string" ? { text: parsed.text.slice(0, 3000), draft: parsed.draft ?? undefined } : { text: content.slice(0, 3000) };
  } catch (e) {
    console.error("AI gateway error", (e as Error).name);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
