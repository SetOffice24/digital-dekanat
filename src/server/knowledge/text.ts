/**
 * Текст библиотеки знаний: извлечение из PDF/Word, разбиение на фрагменты, поиск по фрагментам.
 * Поиск работает без нейросети: слова приводятся к основе (русские окончания отрезаются),
 * фрагменты ранжируются по BM25, заголовок материала весит больше. С ключом ИИ найденные фрагменты
 * дополнительно пересказывает модель — но источник всегда один и тот же.
 */

/* ---------------- Извлечение текста ---------------- */

export class ExtractError extends Error {}

/** Текст из PDF или .docx. Скан без текстового слоя — понятная ошибка (распознавание картинок не делаем). */
const MAX_PAGES = 150;
const MAX_TEXT = 400_000;
const TIMEOUT_MS = 20_000;

/** Ограничение времени разбора: «тяжёлый» файл не держит запрос бесконечно. */
const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new ExtractError("Файл слишком сложный для разбора — вставьте текст вручную")), TIMEOUT_MS))]);

export async function extractText(name: string, buf: Buffer): Promise<string> {
  const ext = name.toLowerCase().split(".").pop();
  let text = "";
  if (ext === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await withTimeout(getDocumentProxy(new Uint8Array(buf)));
    // число страниц проверяем до разбора текста: размер сжатого файла не ограничивает объём работы
    if (pdf.numPages > MAX_PAGES) throw new ExtractError(`В файле больше ${MAX_PAGES} страниц — разделите его на части`);
    const r = await withTimeout(pdfText(pdf, { mergePages: false }));
    text = (r.text as string[]).join("\n\n");
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    text = (await withTimeout(mammoth.extractRawText({ buffer: buf }))).value;
  } else {
    throw new ExtractError("Подходят файлы PDF и Word (.docx)");
  }
  if (text.length > MAX_TEXT) throw new ExtractError("Текста в файле слишком много — разделите его на несколько материалов");
  text = cleanText(text);
  if (text.replace(/\s/g, "").length < 40) throw new ExtractError("В файле не нашлось текста — возможно, это скан. Вставьте текст вручную.");
  return text;
}

/** Убираем мусор вёрстки: переносы слов, лишние пробелы, пустые строки подряд. */
export function cleanText(s: string) {
  return s
    .replace(/\r/g, "")
    .replace(/­/g, "")
    .replace(/([а-яёa-z])-\n([а-яёa-z])/gi, "$1$2")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------------- Фрагменты ---------------- */

export type Chunk = { idx: number; heading: string | null; text: string };
const MAX_CHUNK = 900;

/** Строка похожа на заголовок: «# …», «1. Пересдачи», короткая без точки в конце. */
export const isHeading = (line: string) => /^#{1,4}\s/.test(line) || (line.length <= 80 && line.length >= 3 && !/[.,;:!?…]$/.test(line) && /^[«"(]?[А-ЯЁA-Z0-9]/.test(line) && line.split(" ").length <= 10);
const stripHash = (h: string) => h.replace(/^#{1,4}\s*/, "").trim();

/** Разбить текст на разделы по заголовкам и абзацам, до ~900 знаков. Заголовок раздела хранится у каждого его фрагмента. */
export function chunkText(body: string): Chunk[] {
  const paras = body.split(/\n\s*\n|\n(?=#{1,4}\s)/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let buf = "";
  const flush = () => {
    if (buf.trim()) chunks.push({ idx: chunks.length, heading, text: buf.trim() });
    buf = "";
  };
  for (const p of paras) {
    const lines = p.split("\n");
    // заголовок отдельной строкой в начале абзаца
    if (isHeading(lines[0]) && (lines.length > 1 || paras.length > 1)) {
      flush();
      heading = stripHash(lines[0]);
      lines.shift();
    }
    const text = lines.join("\n").trim();
    if (!text) continue;
    if (buf && buf.length + text.length > MAX_CHUNK) flush();
    // слишком длинный абзац режем по предложениям
    if (text.length > MAX_CHUNK) {
      for (const s of text.split(/(?<=[.!?…])\s+/)) {
        if (buf && buf.length + s.length > MAX_CHUNK) flush();
        buf += (buf ? " " : "") + s;
      }
    } else buf += (buf ? "\n" : "") + text;
  }
  flush();
  return chunks;
}

/* ---------------- Слова и основы ---------------- */

const STOP = new Set(
  "а без более бы был была были было быть в вам вас весь во вот все всё всего вы где да даже для до его ее её если есть еще ещё же за и из или им их к как какая какие каких какой когда кто ли либо мне мной мог могу можно мой моя мои мы на над надо нам нас не нет ни но ну о об обо он она они оно от по под подскажи подскажите пожалуйста при про раз расскажи расскажите с со скажи скажите сколько так также там те тем то тоже только ты у уже хочу чем что чтобы чтоб эта эти это этот я нужно нужна нужен должен должна можете мою моё мое мое свой своя свои".split(" "),
);

const ENDINGS = [
  "ениями", "ениях", "ением", "ений", "ению", "ения", "ение", "ости", "ость", "остью",
  "иями", "ями", "ами", "иях", "ией", "ием", "ого", "его", "ому", "ему", "ыми", "ими", "ешь", "ишь", "ете", "ите", "ются", "ется", "ится", "ться", "тся",
  "ах", "ях", "ов", "ев", "ей", "ий", "ый", "ой", "ая", "яя", "ое", "ее", "ые", "ие", "ам", "ям", "ом", "ем", "ую", "юю", "ть", "ет", "ит", "ут", "ют", "ат", "ят", "ал", "ил", "ла", "ли",
  "а", "я", "о", "е", "ы", "и", "у", "ю", "ь", "й",
];

/** Основа русского слова: «пересдачи», «пересдача», «пересдачу» → «пересдач». */
export function stemRu(word: string) {
  const w = word.toLowerCase().replace(/ё/g, "е");
  if (!/[а-я]/.test(w) || w.length <= 4) return w;
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length);
  return w;
}

/** Разговорные слова студентов → слова из официальных текстов: «лаба» → «лабораторная», «академ» → «академический». */
const SYN: Record<string, string> = {
  лаба: "лабораторная", лабу: "лабораторную", лабы: "лабораторные", лабе: "лабораторной", лабой: "лабораторной", лабка: "лабораторная", лабки: "лабораторные",
  академ: "академический отпуск", академа: "академического отпуска", академку: "академический отпуск", академка: "академический отпуск",
  препод: "преподаватель", препода: "преподавателя", преподу: "преподавателю", преподы: "преподаватели",
  стипуха: "стипендия", стипуху: "стипендию", стипухи: "стипендии",
  домашка: "домашнее", домашку: "домашнее", дз: "домашнее", общага: "общежитие", общагу: "общежитие", общаге: "общежитии",
  приходит: "выплачивается", придет: "выплачивается", платят: "выплачивается", начисляют: "выплачивается",
  позже: "опоздание", опоздал: "опоздание", опоздать: "опоздание", просрочил: "опоздание", просрочить: "опоздание",
  военник: "военкомат", больничный: "болезнь", болел: "болезнь", заболел: "болезнь", автоматом: "автомат",
};

/** Значимые основы слов текста (без служебных слов и чисел-одиночек). */
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/)
    .flatMap((w) => (SYN[w] ?? w).split(" "))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d{1,2}$/.test(w))
    .map(stemRu);
}

/** Основы совпадают: равны или одна — начало другой (от 5 букв): «академ» ~ «академическ». */
const match = (q: string, t: string) => q === t || (q.length >= 5 && t.length >= 5 && (t.startsWith(q) || q.startsWith(t)));

/* ---------------- Поиск ---------------- */

export type Searchable = { id: string; docId: string; title: string; heading: string | null; text: string };
export type Hit<T extends Searchable> = { chunk: T; score: number; coverage: number; excerpt: string };

/**
 * BM25 по фрагментам. coverage — какая доля слов вопроса нашлась во фрагменте (вместе с заголовками).
 * Возвращает лучшие фрагменты, не больше двух из одного материала.
 */
export function rankChunks<T extends Searchable>(query: string, chunks: T[], limit = 4): Hit<T>[] {
  const q = [...new Set(terms(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => {
    // название материала и раздела учитываем дважды — это самые точные слова
    const ts = [...terms(c.title), ...terms(c.title), ...(c.heading ? [...terms(c.heading), ...terms(c.heading)] : []), ...terms(c.text)];
    const tf = new Map<string, number>();
    for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { c, tf, len: ts.length };
  });
  const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  const N = docs.length;
  const df = new Map<string, number>();
  for (const w of q) df.set(w, docs.filter((d) => [...d.tf.keys()].some((t) => match(w, t))).length);
  const k1 = 1.4, b = 0.75;
  const scored = docs.map((d) => {
    let score = 0, hit = 0;
    for (const w of q) {
      let f = 0;
      for (const [t, n] of d.tf) if (match(w, t)) f += n;
      if (!f) continue;
      hit++;
      const n = df.get(w) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg)));
    }
    return { chunk: d.c, score, coverage: hit / q.length, excerpt: "" };
  });
  const perDoc = new Map<string, number>();
  const out: Hit<T>[] = [];
  for (const s of scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score)) {
    const n = perDoc.get(s.chunk.docId) ?? 0;
    if (n >= 2) continue;
    perDoc.set(s.chunk.docId, n + 1);
    out.push({ ...s, excerpt: excerpt(s.chunk.text, q) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Ответ уверенный: нашлась большая часть слов вопроса (для коротких вопросов — все значимые). */
export function confident(h: { coverage: number; score: number } | undefined, query: string) {
  if (!h) return false;
  const n = new Set(terms(query)).size;
  return h.score >= 1.2 && (n <= 2 ? h.coverage >= 0.99 : h.coverage >= 0.6);
}

/** Цитата: 1–3 предложения фрагмента, где больше всего слов вопроса, до ~360 знаков. */
export function excerpt(text: string, q: string[]) {
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return text.slice(0, 360);
  const hits = sentences.map((s) => {
    const ts = terms(s);
    return q.filter((w) => ts.some((t) => match(w, t))).length;
  });
  let best = 0;
  hits.forEach((h, i) => (h > hits[best] ? (best = i) : 0));
  // вопрос совпал в основном с заголовком раздела — цитируем раздел с начала, а не случайную фразу из середины
  if (hits[best] < Math.ceil(q.length / 2)) best = 0;
  let out = sentences[best];
  // добираем следующие предложения, пока коротко (часто ответ — в продолжении)
  for (let i = best + 1; i < sentences.length && out.length < 220; i++) out += " " + sentences[i];
  return out.length > 360 ? out.slice(0, 357).replace(/\s+\S*$/, "") + "…" : out;
}
