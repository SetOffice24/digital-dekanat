import "server-only";
/**
 * Помощник деканата. Видит только область сотрудника (свой факультет; без факультета — всё).
 * Умеет: сводки по заявкам, поиск заявки и студента, расписание группы, аккаунты, фото;
 * готовит черновик объявления — публикует сотрудник кнопкой после проверки (решение команды 18.11).
 */
import { z } from "zod";
import type { RequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { countByStatus, listGroups, listRequests, studentScope, variants, type SessionStaff } from "../repos/staff";
import { accountsOverview } from "../repos/accounts";
import { photoQueueCount } from "../repos/photos";
import { requestStatusLabel } from "@/lib/labels";
import { addDays, fmtDay, moscowToday, plural, relativeTime } from "@/lib/utils";
import { bells } from "@/config/university";
import { sharedTools } from "./tools/shared";
import { examplesOf, classifyWithModel, route, type Suggestion, type Tool, type ToolResult, type Widget } from "./router";
import { bestMentions, findGroup, gatewayJson, hasAny, norm, parseDay, type AiLink, type ChatMsg } from "./common";

export type AnnouncementDraft = { kind: "ANNOUNCEMENT"; audience: "ALL" | "FACULTY" | "GROUP"; groupId: string; title: string; body: string };
/** Перенос пары: какую (lessonId), куда (дата, пара по звонкам, аудитория), причина. */
export type MoveDraft = { kind: "MOVE"; groupId: string; lessonId: string; date: string; bell: string; room: string; reason: string };
export type StaffReply = { text: string; draft?: AnnouncementDraft | MoveDraft; links?: AiLink[]; widget?: Widget; suggestions?: Suggestion[]; source: "gateway" | "rules"; via?: string };

/**
 * «Перенеси пару ИВТ-24-1 по дискретной математике со среды на пятницу 12:20 в 401, причина: конференция».
 * До «на» — какую пару (дисциплина, день), после — куда. Неясное остаётся пустым: сотрудник выберет в карточке.
 */
export async function moveFromText(text: string, ctx: StaffContext): Promise<MoveDraft | null> {
  const group = findGroup(text, ctx.groups);
  if (!group) return null;
  // «… с 20.11 на пятницу …»; кнопка «Перенести» из расписания присылает «… с 20.11 на» (куда — выберут в карточке)
  const split = text.search(/\sна(\s|$)/i);
  const from = split >= 0 ? text.slice(0, split) : "";
  const to = split >= 0 ? text.slice(split) : text;
  const today = moscowToday();
  const lessons = await prisma.lesson.findMany({
    where: { groupId: group.id, status: { not: "CANCELLED" }, date: { gte: today, lt: addDays(today, 21) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, date: true, startTime: true, course: { select: { name: true } } },
  });
  // какую пару: дисциплина и/или день из части «до на». Не нашли однозначно — не угадываем:
  // поле остаётся пустым и сотрудник выбирает пару сам (ошибка здесь = перенос не той пары у целой группы)
  const fromDay = from ? parseDay(from) : null;
  const sameDay = (l: (typeof lessons)[number]) => !fromDay || l.date.getTime() === fromDay.getTime();
  const courseHits = bestMentions(from || text, lessons, (l) => l.course.name);
  const candidates = courseHits.length ? courseHits.filter(sameDay) : fromDay ? lessons.filter(sameDay) : [];
  const lesson = candidates.length === 1 || (courseHits.length && candidates.length) ? candidates[0] : undefined;
  const day = parseDay(to);
  const t = norm(to);
  const hhmm = t.match(/(\d{1,2})[:.](\d{2})/);
  const nth = t.match(/(\d)\s*(?:-?ю|-?я)?\s*пар/)?.[1];
  const bell = hhmm
    ? bells.find((b) => b.start === `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`)
    : nth
      ? bells.find((b) => b.n === Number(nth))
      : undefined;
  const room = to.match(/(?:ауд(?:итори[юия])?\.?\s*|\sв\s+)([А-ЯA-Z]?-?\d{2,4}[а-яa-z]?)(?![:.\d])/i)?.[1] ?? "";
  const reason = text.match(/(?:причина|из-за|потому что)\s*:?\s*([\s\S]{3,})$/i)?.[1].trim() ?? "";
  return { kind: "MOVE", groupId: group.id, lessonId: lesson?.id ?? "", date: day ? day.toISOString().slice(0, 10) : "", bell: bell ? `${bell.start}|${bell.end}` : "", room, reason: reason.replace(/^./, (c) => c.toUpperCase()) };
}
export async function buildStaffContext(s: SessionStaff & { fullName: string }) {
  const [counts, groups, photos, newest] = await Promise.all([countByStatus(s), listGroups(s), photoQueueCount(s), listRequests(s, { status: "NEW" })]);
  const lines: string[] = [];
  lines.push(`Сотрудник деканата: ${s.fullName}. Область: ${s.facultyId ? "свой факультет" : "все факультеты"}. Сегодня: ${fmtDay(moscowToday())}.`);
  lines.push(`Заявки по статусам: ${Object.entries(counts).map(([k, v]) => `${requestStatusLabel[k as RequestStatus]} — ${v}`).join(", ") || "нет"}.`);
  lines.push(`Новые заявки (старые сверху): ${[...newest].reverse().slice(0, 10).map((r) => `№${r.number} «${r.type.title}», ${r.student.lastName} ${r.student.firstName} (${r.student.group.name})`).join("; ") || "нет"}.`);
  lines.push(`Фото на проверке: ${photos}. Группы: ${groups.map((g) => g.name).join(", ")}.`);
  return { text: lines.join("\n"), counts, groups, photos, newest, staff: s };
}
export type StaffContext = Awaited<ReturnType<typeof buildStaffContext>>;

/** Черновик объявления из фразы: группа (если названа), заголовок и текст. */
export function announcementFromText(text: string, ctx: StaffContext): AnnouncementDraft {
  const group = findGroup(text, ctx.groups);
  const t = norm(text);
  const audience: AnnouncementDraft["audience"] = group ? "GROUP" : ctx.staff.facultyId || hasAny(t, "факультет") ? "FACULTY" : "ALL";
  // текст — после двоеточия или после «что …»; иначе вся фраза без служебного начала
  const after = text.match(/[:—]\s*([\s\S]{3,})$/)?.[1] ?? text.match(/(?:^|\s)что\s+([\s\S]{3,})$/i)?.[1] ?? text.replace(/^.*?(объявлени\S*|оповести\S*|сообщи\S*|напиши\S*|разошли\S*)\s*(групп\S*\s*\S*)?/i, "");
  const body = after.trim().replace(/^./, (c) => c.toUpperCase());
  const first = body.split(/[.!?\n]/)[0].trim();
  const title = first.length > 3 ? (first.length > 80 ? first.slice(0, 77) + "…" : first) : "Объявление";
  return { kind: "ANNOUNCEMENT", audience, groupId: group?.id ?? "", title, body: body.length > 3 ? body : "" };
}

/** Поиск заявок по номеру или фамилии (фамилия может быть в косвенном падеже). */
async function findRequests(message: string, ctx: StaffContext) {
  const m = norm(message);
  const num = m.match(/№\s*(\d+)|(?:^|\s)(\d{2,6})(?:\s|$)/);
  const surname = message.match(/[А-ЯЁ][а-яё]{2,}/g)?.filter((w) => !["Найди", "Покажи", "Заявка", "Заявки", "Заявку", "Справка", "Сколько", "Какие", "Новые", "Открой"].includes(w));
  const q = num ? (num[1] ?? num[2]) : surname?.[0];
  if (!q) return null;
  let found = (await listRequests(ctx.staff, { q })).slice(0, 6);
  if (!found.length && /[ауе]$|ой$|ым$/.test(q)) found = (await listRequests(ctx.staff, { q: q.replace(/(ой|ым|[ауе])$/, "") })).slice(0, 6);
  return { q, found };
}

/**
 * Инструменты помощника деканата: входящие заявки (мини-раздел с «Взять в работу»), поиск заявки и студента,
 * расписание группы (с отменой и переносом), фото на проверке, аккаунты, объявление и перенос (черновики).
 */
export const staffTools: Tool<StaffContext>[] = [
  ...sharedTools<StaffContext>("staff"),
  {
    name: "inbox",
    title: "Входящие заявки",
    keywords: [["заяв", 2], ["новые заявк", 4], ["сколько заявок", 4], ["сколько новых", 4], ["входящ", 4], ["что в работе", 3]],
    examples: ["Сколько новых заявок?", "Покажи входящие", "Что в работе?"],
    not: ["найди", "№"],
    run: (msg, ctx) => {
      const c = ctx.counts;
      const status = /в работе/.test(norm(msg)) ? "IN_REVIEW" : "NEW";
      const oldest = ctx.newest.at(-1);
      return {
        // остальные статусы — во вкладках мини-раздела; в тексте только то, что требует внимания
        text:
          status === "NEW"
            ? (c.NEW ? `Новых заявок — ${c.NEW}${oldest ? `, самая давняя ждёт ${relativeTime(oldest.createdAt).replace(" назад", "")}` : ""}.` : "Новых заявок нет.") + (c.NEED_INFO ? ` Ответа студента ждут ${c.NEED_INFO}.` : "")
            : `В работе — ${c.IN_REVIEW ?? 0}.`,
        widget: { type: "staff.inbox", params: { status } },
      };
    },
  },
  {
    name: "findrequest",
    title: "Найти заявку",
    keywords: [["найди заявк", 5], ["заявку", 2], ["заявка №", 5], ["заявка номер", 5], ["заявки студент", 3]],
    examples: ["Найди заявку Озёрова", "Заявка № 12"],
    run: async (msg, ctx) => {
      const r = await findRequests(msg, ctx);
      if (!r) return { text: "Назовите номер заявки или фамилию студента, например: «найди заявку Озёрова»." };
      if (!r.found.length) return { text: `Заявок по запросу «${r.q}» не нашёл.` };
      return {
        text: `Нашёл ${r.found.length}:\n${r.found.map((x) => `• №${x.number} «${x.type.title}» — ${x.student.lastName} ${x.student.firstName}, ${x.student.group.name}, ${requestStatusLabel[x.status].toLowerCase()}`).join("\n")}`,
        links: r.found.slice(0, 3).map((x) => ({ href: `/staff/requests/${x.id}`, label: `№${x.number}` })),
      };
    },
  },
  {
    name: "groupday",
    title: "Расписание группы",
    keywords: [["распис", 3], ["пары", 2], ["пара ", 1.5], ["завтра", 1], ["сегодня", 1], ["аудитор", 1.5], ["занят", 2], ["отмени", 3]],
    examples: ["Пары ИВТ-24-1 завтра", "Расписание ЭК-23-2 на пятницу", "Отмени пару ИВТ-24-1"],
    not: ["перенес", "перенос"],
    run: (msg, ctx) => {
      const group = findGroup(msg, ctx.groups);
      if (!group) return { text: "Какой группы? Например: «пары ИВТ-24-1 завтра».", suggestions: ctx.groups.slice(0, 4).map((g) => ({ label: g.name, message: `Пары ${g.name} сегодня`, tool: "groupday" })) };
      const day = parseDay(msg) ?? moscowToday();
      return {
        text: "Пару можно перенести или отменить прямо здесь — студенты получат уведомление.",
        widget: { type: "staff.groupday", params: { groupId: group.id, date: day.toISOString().slice(0, 10) } },
      };
    },
  },
  {
    name: "move",
    title: "Перенести пару",
    keywords: [["перенес", 4], ["перенос", 4], ["переставь", 4], ["передвинь", 4]],
    examples: ["Перенеси пару ИВТ-24-1 по операционным системам с четверга на пятницу 12:20 в 401, причина: конференция"],
    run: async (message, ctx) => {
      const group = findGroup(message, ctx.groups);
      const d = await moveFromText(message, ctx);
      if (!d) return { text: "Для какой группы перенести пару? Например: «перенеси пару ИВТ-24-1 по дискретной математике со среды на пятницу 12:20 в 401, причина: конференция»." };
      const l = d.lessonId ? await prisma.lesson.findUnique({ where: { id: d.lessonId }, select: { date: true, startTime: true, course: { select: { name: true } } } }) : null;
      return {
        text: l
          ? `Нашёл пару: ${l.course.name}, ${fmtDay(l.date).toLowerCase()}, ${l.startTime} (${group?.name}). Проверьте, что это она, новую дату, время, аудиторию и причину — и нажмите «Перенести»: студенты получат уведомление.`
          : `Не смог однозначно определить, какую пару ${group?.name} переносить — выберите её в карточке, проверьте новую дату и время и нажмите «Перенести».`,
        draft: d,
      };
    },
  },
  {
    name: "announce",
    title: "Объявление",
    keywords: [["объяви", 4], ["объявлен", 4], ["оповест", 4], ["разошли", 4], ["сообщи групп", 4], ["сообщи студент", 4], ["напиши групп", 4], ["напиши студентам", 4], ["напиши всем", 4], ["сообщи всем", 4], ["предупреди", 3]],
    examples: ["Объяви ИВТ-24-1: лекция в понедельник переносится в 401"],
    run: (message, ctx) => {
      const group = findGroup(message, ctx.groups);
      const d = announcementFromText(message, ctx);
      const where = d.audience === "GROUP" ? `группе ${group?.name}` : d.audience === "FACULTY" ? "всему факультету" : "всем студентам";
      return { text: `Подготовил объявление ${where}. Проверьте заголовок и текст — и нажмите «Опубликовать»: студенты получат уведомление.`, draft: d };
    },
  },
  {
    name: "photos",
    title: "Фото на проверке",
    keywords: [["фото", 4], ["фотограф", 4]],
    examples: ["Сколько фото ждут проверки?", "Покажи фото на проверке"],
    run: (_msg, ctx) => ({
      text: ctx.photos ? `На проверке ${ctx.photos} фото. Принять или отклонить с причиной можно прямо здесь.` : "Новых фото на проверке нет.",
      widget: ctx.photos ? { type: "staff.photos", params: {} } : undefined,
      links: [{ href: "/staff/students/photos", label: "Фото студентов" }],
    }),
  },
  {
    name: "accounts",
    title: "Аккаунты",
    keywords: [["не входил", 4], ["не заходил", 4], ["аккаунт", 4], ["пароль", 3], ["заблок", 3], ["неактивн", 3]],
    examples: ["Кто из ИВТ-24-1 не входил?", "Сколько заблокированных аккаунтов"],
    run: async (message, ctx) => {
      const group = findGroup(message, ctx.groups);
      const { stats } = await accountsOverview(ctx.staff, { groupId: group?.id });
      return {
        text: `${group ? `Группа ${group.name}` : "Ваша область"}: ${stats.total} ${plural(stats.total, "студент", "студента", "студентов")}, ни разу не входили — ${stats.never}.` + (hasAny(norm(message), "пароль") ? " Временный пароль выдаётся в личном деле студента — блок «Аккаунт»." : ""),
        widget: { type: "staff.accounts", params: { groupId: group?.id ?? "" } },
      };
    },
  },
  {
    name: "student",
    title: "Найти студента",
    keywords: [["найди студент", 5], ["студент", 1.5], ["личное дело", 4], ["открой", 1.5], ["покажи студент", 4]],
    examples: ["Найди студента Леснова", "Личное дело Озёрова"],
    run: async (message, ctx) => {
      const word = message.match(/[А-ЯЁ][а-яё]{3,}/g)?.find((w) => !["Найди", "Покажи", "Открой", "Студент", "Студентка", "Студента", "Личное", "Где", "Кто"].includes(w));
      if (!word) return { text: "Назовите фамилию, например: «найди студента Леснова»." };
      const st = await prisma.student.findMany({ where: { ...studentScope(ctx.staff), OR: variants(word).flatMap((v) => [{ lastName: { contains: v } }, { lastName: { contains: v.replace(/(а|у|ой|ым)$/, "") } }]) }, take: 5, select: { id: true, lastName: true, firstName: true, group: { select: { name: true } } } });
      if (!st.length) return { text: `Студентов с фамилией «${word}» в вашей области нет.` };
      return { text: `Нашёл: ${st.map((x) => `${x.lastName} ${x.firstName} (${x.group.name})`).join(", ")}.`, links: st.map((x) => ({ href: `/staff/students/${x.id}`, label: `${x.lastName} ${x.firstName[0]}.` })) };
    },
  },
];

const staffHelp = (): ToolResult => ({
  text: "Здравствуйте! Я помогаю с рутиной деканата: входящие заявки с действиями прямо в чате, поиск заявки и студента, расписание группы с отменой и переносом, фото на проверке, аккаунты, объявления. Готовлю черновики — публикуете и переносите вы.",
  suggestions: examplesOf(staffTools, ["inbox", "groupday", "photos", "accounts", "announce", "findrequest"]),
});

export async function rulesStaff(message: string, ctx: StaffContext, forced?: string): Promise<StaffReply> {
  const r = await route(message, staffTools, ctx, { forced, help: staffHelp, classify: classifyWithModel });
  return { text: r.text, draft: r.draft as AnnouncementDraft | MoveDraft | undefined, links: r.links, widget: r.widget, suggestions: r.suggestions, source: "rules", via: r.via };
}

const draftSchema = z.object({ kind: z.literal("ANNOUNCEMENT"), audience: z.enum(["ALL", "FACULTY", "GROUP"]), groupId: z.string().max(40).default(""), title: z.string().max(120), body: z.string().max(3000) });

/** Черновик модели проверяется: группа — только из области сотрудника, «всем» — только сотруднику без факультета. */
function sanitize(d: unknown, ctx: StaffContext): AnnouncementDraft | undefined {
  const p = draftSchema.safeParse(d);
  if (!p.success) return undefined;
  const g = ctx.groups.find((x) => x.id === p.data.groupId);
  const audience = p.data.audience === "GROUP" && !g ? "FACULTY" : p.data.audience === "ALL" && ctx.staff.facultyId ? "FACULTY" : p.data.audience;
  return { ...p.data, audience, groupId: g?.id ?? "" };
}

/** Сначала правила (распознавание инструмента); что не узнали — модели через шлюз (если подключена). */
export async function staffReply(history: ChatMsg[], ctx: StaffContext, forced?: string): Promise<StaffReply> {
  const last = history[history.length - 1]?.content ?? "";
  const viaRules = await rulesStaff(last, ctx, forced);
  if (viaRules.via !== "help") return viaRules;
  const system = `Ты — помощник сотрудника деканата «Универа». Отвечай по-русски, кратко, деловым тоном.
Используй только данные из контекста; не выдумывай номера заявок и фамилии.
Сам ты ничего не публикуешь и не меняешь. Если просят объявление — подготовь черновик, его опубликует сотрудник кнопкой.
Черновик: {"kind":"ANNOUNCEMENT","audience":"GROUP"|"FACULTY"|"ALL","groupId":"<id группы или пусто>","title":"...","body":"..."}.
Ответ — строго JSON: {"text":"...","draft": {...} | null}

Группы (id — название):
${ctx.groups.map((g) => `${g.id} — ${g.name}`).join("\n")}

КОНТЕКСТ:
${ctx.text}`;
  const g = await gatewayJson(system, history);
  if (g) return { text: g.text, draft: sanitize(g.draft, ctx), source: "gateway" };
  return viaRules;
}

