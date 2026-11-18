import "server-only";
/**
 * Распознавание намерения: «гибрид чат-бота и нейросети».
 * Каждая функция помощника — «инструмент» с ключевыми словами (с весами) и примерами фраз.
 * 1. Правила оценивают фразу по всем инструментам роли.
 * 2. Уверенный лидер — вызываем его. Два близких кандидата — переспрашиваем кнопками «Вы про X или Y?».
 * 3. Не узнали — если подключена модель, она выбирает инструмент из того же списка; иначе — подсказки.
 * Инструмент возвращает текст, мини-раздел (виджет), черновик действия, ссылки и кнопки следующих шагов.
 */
import { gatewayJson, norm, type AiLink } from "./common";

/** Мини-раздел в ответе: тип и параметры; данные подгружаются при показе (всегда актуальные). */
export type Widget = { type: string; params: Record<string, string> };
/** Кнопка под ответом: отправляет фразу; tool — сразу нужный инструмент (без повторного распознавания). */
export type Suggestion = { label: string; message: string; tool?: string };

export type ToolResult = { text: string; draft?: unknown; links?: AiLink[]; widget?: Widget; suggestions?: Suggestion[] };

export type Tool<C> = {
  name: string;
  /** подпись на кнопке уточнения */
  title: string;
  /** основы слов и вес: [«распис», 3] */
  keywords: [string, number][];
  /** примеры фраз — для похожести и подсказок */
  examples: string[];
  /** слова, при которых инструмент точно не подходит */
  not?: string[];
  run: (message: string, ctx: C) => Promise<ToolResult> | ToolResult;
};

const CONFIDENT = 2.5;
const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2));
const tokens = (s: string) => new Set(norm(s).split(/[^a-zа-я0-9№]+/).filter((w) => w.length >= 3).map(stem));

/** Оценка фразы для инструмента: ключевые слова + похожесть на примеры. */
export function score<C>(message: string, tool: Tool<C>) {
  const m = norm(message);
  if (tool.not?.some((w) => m.includes(w))) return 0;
  let s = 0;
  for (const [w, weight] of tool.keywords) if (m.includes(w)) s += weight;
  const mt = tokens(message);
  let best = 0;
  for (const ex of tool.examples) {
    const et = tokens(ex);
    if (!et.size) continue;
    let hit = 0;
    for (const t of et) if (mt.has(t)) hit++;
    best = Math.max(best, hit / et.size);
  }
  return s + best * 3;
}

export function rank<C>(message: string, tools: Tool<C>[]) {
  return tools.map((tool) => ({ tool, score: score(message, tool) })).sort((a, b) => b.score - a.score);
}

export type RouteOptions<C> = {
  /** кнопка уточнения передаёт выбранный инструмент */
  forced?: string;
  /** ответ, если ничего не подошло (справка роли) */
  help: (ctx: C) => ToolResult;
  /** модель: выбрать инструмент по фразе (null — не уверена / ключа нет) */
  classify?: (message: string, tools: Tool<C>[]) => Promise<string | null>;
};

export async function route<C>(message: string, tools: Tool<C>[], ctx: C, o: RouteOptions<C>): Promise<ToolResult & { tool: string | null; via: "forced" | "rules" | "model" | "help" | "clarify" }> {
  if (o.forced) {
    const t = tools.find((x) => x.name === o.forced);
    if (t) return { ...(await t.run(message, ctx)), tool: t.name, via: "forced" };
  }
  const ranked = rank(message, tools);
  const [first, second] = ranked;
  if (first && first.score >= CONFIDENT) {
    // два близких по смыслу варианта — не гадаем, спрашиваем
    if (second && second.score >= CONFIDENT && second.score >= first.score * 0.85) {
      const options = ranked.filter((r) => r.score >= CONFIDENT && r.score >= first.score * 0.85).slice(0, 3);
      return {
        text: "Уточните, что вам нужно:",
        suggestions: options.map((r) => ({ label: r.tool.title, message, tool: r.tool.name })),
        tool: null,
        via: "clarify",
      };
    }
    return { ...(await first.tool.run(message, ctx)), tool: first.tool.name, via: "rules" };
  }
  if (o.classify) {
    const name = await o.classify(message, tools);
    const t = name ? tools.find((x) => x.name === name) : undefined;
    if (t) return { ...(await t.run(message, ctx)), tool: t.name, via: "model" };
  }
  const help = o.help(ctx);
  // если что-то отдалённо подошло — предложим это первым
  const near = ranked.filter((r) => r.score > 0.8).slice(0, 3);
  return {
    ...help,
    suggestions: near.length ? near.map((r) => ({ label: r.tool.title, message, tool: r.tool.name })) : help.suggestions,
    tool: null,
    via: "help",
  };
}

/**
 * Нейросеть как классификатор: когда правила не уверены, модель выбирает инструмент из того же списка.
 * Она видит только названия и примеры функций (не данные пользователя). Без ключа шлюза — null.
 */
export async function classifyWithModel<C>(message: string, tools: Tool<C>[]): Promise<string | null> {
  const system = `Ты — классификатор запросов к помощнику цифрового деканата. Выбери одну функцию, которая выполняет запрос пользователя, или null, если ни одна не подходит (например, общий вопрос).
Функции (name — описание — примеры):
${tools.map((t) => `${t.name} — ${t.title} — ${t.examples.join(" | ")}`).join("\n")}
Ответ — строго JSON: {"text":"", "draft": {"tool": "<name>" | null}}`;
  const r = await gatewayJson(system, [{ role: "user", content: message }]);
  const name = (r?.draft as { tool?: unknown } | undefined)?.tool;
  return typeof name === "string" && tools.some((t) => t.name === name) ? name : null;
}

/** Подсказки «что ещё можно» — по примерам инструментов. */
export const examplesOf = <C>(tools: Tool<C>[], names: string[]): Suggestion[] =>
  names.map((n) => tools.find((t) => t.name === n)).filter((t): t is Tool<C> => !!t).map((t) => ({ label: t.examples[0], message: t.examples[0], tool: t.name }));
