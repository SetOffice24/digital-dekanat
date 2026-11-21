import "server-only";
/**
 * Ответы по библиотеке знаний (RAG). Сначала поиск фрагментов — только в материалах, видимых пользователю.
 * Без ключа ИИ: цитата лучшего раздела и ссылка на источник (ничего не придумываем).
 * С ключом: модель пересказывает своими словами строго по найденным фрагментам; если в них ответа нет — молчит,
 * и помощник честно говорит, что в библиотеке этого нет.
 */
import { searchKnowledge, type KnowledgeViewer } from "../repos/knowledge";
import { confident } from "../knowledge/text";
import { gatewayJson, type AiLink } from "./common";
import type { ToolResult } from "./router";

export const libraryBase = (role: KnowledgeViewer["role"]) => (role === "STAFF" ? "/staff/library" : role === "TEACHER" ? "/teacher/library" : "/library");

type LibAnswer = ToolResult & { source: "library" | "gateway" };

export async function libraryAnswer(viewer: KnowledgeViewer, question: string): Promise<LibAnswer | null> {
  const hits = await searchKnowledge(viewer, question, 4);
  if (!hits.length) return null;
  const base = libraryBase(viewer.role);
  const linkOf = (docId: string, title: string): AiLink => ({ href: `${base}/${docId}`, label: title.length > 48 ? title.slice(0, 46) + "…" : title });
  const uniqueLinks = (hs: typeof hits) => [...new Map(hs.map((h) => [h.docId, linkOf(h.docId, h.title)])).values()].slice(0, 3);

  // с ключом ИИ — пересказ по найденным фрагментам (источники те же)
  const system = `Ты — помощник цифрового деканата «Универа». Ответь на вопрос пользователя по-русски, на «вы», до 5 предложений,
ТОЛЬКО по фрагментам библиотеки ниже. Не добавляй ничего от себя. Если ответа во фрагментах нет — верни {"text":""}.
В конце ответа укажи источник: (по «Название материала»).
Ответ — строго JSON: {"text":"..."}

${hits.map((h, i) => `[${i + 1}] «${h.title}»${h.heading ? ` → ${h.heading}` : ""}:\n${h.text}`).join("\n\n")}`;
  const g = await gatewayJson(system, [{ role: "user", content: question }]);
  if (g?.text?.trim()) return { text: g.text.trim(), links: uniqueLinks(hits), source: "gateway" };

  // второй источник — только если он почти так же хорош, как первый
  const good = hits.filter((h, i) => confident(h, question) && (i === 0 || h.score >= hits[0].score * 0.75)).slice(0, 2);
  if (!good.length) return null;
  const [first, second] = good;
  const quote = (h: (typeof hits)[number]) => `«${h.excerpt}»`;
  let text = `В «${first.title}»${first.heading ? `, раздел «${first.heading}»` : ""}:\n${quote(first)}`;
  if (second && second.docId !== first.docId) text += `\n\nЕщё в «${second.title}»:\n${quote(second)}`;
  else if (second) text += `\n\n${second.heading ? `Раздел «${second.heading}»: ` : ""}${quote(second)}`;
  return { text, links: uniqueLinks(good), source: "library" };
}

/** Ссылка «Подробнее» на материал, если вопрос уверенно совпал с библиотекой (к ответам на справки, пересдачу и т. п.). */
export async function libraryLink(viewer: KnowledgeViewer, question: string): Promise<AiLink | null> {
  const [h] = await searchKnowledge(viewer, question, 1);
  if (!h || !confident(h, question)) return null;
  return { href: `${libraryBase(viewer.role)}/${h.docId}`, label: `Подробнее: ${h.title.length > 40 ? h.title.slice(0, 38) + "…" : h.title}` };
}
