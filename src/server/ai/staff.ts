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
import { bestMentions, findGroup, gatewayJson, hasAny, norm, parseDay, type AiLink, type ChatMsg } from "./common";

export type AnnouncementDraft = { kind: "ANNOUNCEMENT"; audience: "ALL" | "FACULTY" | "GROUP"; groupId: string; title: string; body: string };
/** Перенос пары: какую (lessonId), куда (дата, пара по звонкам, аудитория), причина. */
export type MoveDraft = { kind: "MOVE"; groupId: string; lessonId: string; date: string; bell: string; room: string; reason: string };
export type StaffReply = { text: string; draft?: AnnouncementDraft | MoveDraft; links?: AiLink[]; source: "gateway" | "rules" };

/**
 * «Перенеси пару ИВТ-24-1 по дискретной математике со среды на пятницу 12:20 в 401, причина: конференция».
 * До «на» — какую пару (дисциплина, день), после — куда. Неясное остаётся пустым: сотрудник выберет в карточке.
 */
export async function moveFromText(text: string, ctx: StaffContext): Promise<MoveDraft | null> {
  const group = findGroup(text, ctx.groups);
  if (!group) return null;
  const split = text.search(/\sна\s/i);
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

export async function rulesStaff(message: string, ctx: StaffContext): Promise<StaffReply> {
  const m = norm(message);
  const s = ctx.staff;
  const group = findGroup(message, ctx.groups);
  const r = (text: string, links?: AiLink[], draft?: AnnouncementDraft | MoveDraft): StaffReply => ({ text, links, draft, source: "rules" });

  // объявление — черновик
  if (hasAny(m, "объяви", "объявлен", "оповест", "разошли", "сообщи групп", "сообщи студент", "напиши групп", "напиши студентам", "напиши всем", "сообщи всем", "предупреди")) {
    const d = announcementFromText(message, ctx);
    const where = d.audience === "GROUP" ? `группе ${group?.name}` : d.audience === "FACULTY" ? "всему факультету" : "всем студентам";
    return r(`Подготовил объявление ${where}. Проверьте заголовок и текст — и нажмите «Опубликовать»: студенты получат уведомление.`, undefined, d);
  }

  // перенос пары — черновик, переносит сотрудник
  if (hasAny(m, "перенес", "перенос", "переставь", "передвинь")) {
    const d = await moveFromText(message, ctx);
    if (!d) return r("Для какой группы перенести пару? Например: «перенеси пару ИВТ-24-1 по дискретной математике со среды на пятницу 12:20 в 401, причина: конференция».");
    const l = d.lessonId ? await prisma.lesson.findUnique({ where: { id: d.lessonId }, select: { date: true, startTime: true, course: { select: { name: true } } } }) : null;
    return r(
      l
        ? `Нашёл пару: ${l.course.name}, ${fmtDay(l.date).toLowerCase()}, ${l.startTime} (${group?.name}). Проверьте, что это она, новую дату, время, аудиторию и причину — и нажмите «Перенести»: студенты получат уведомление.`
        : `Не смог однозначно определить, какую пару ${group?.name} переносить — выберите её в карточке, проверьте новую дату и время и нажмите «Перенести».`,
      undefined,
      d,
    );
  }

  // фото
  if (hasAny(m, "фото"))return r(ctx.photos ? `На проверке ${ctx.photos} ${plural(ctx.photos, "фото", "фото", "фото")}.` : "Новых фото на проверке нет.", [{ href: "/staff/students/photos", label: "Фото студентов" }]);

  // аккаунты
  if (hasAny(m, "не входил", "не заходил", "аккаунт", "пароль", "заблок", "неактивн")) {
    const { stats } = await accountsOverview(s, { groupId: group?.id });
    return r(
      `${group ? `Группа ${group.name}` : "Ваша область"}: ${stats.total} ${plural(stats.total, "студент", "студента", "студентов")}. Ни разу не входили — ${stats.never}, не заходили 14 дней — ${stats.inactive}, ждут смены пароля — ${stats.temp}, заблокированы — ${stats.blocked}.` +
        (hasAny(m, "пароль") ? "\nВременный пароль выдаётся в личном деле студента — блок «Аккаунт»." : ""),
      [{ href: `/staff/students/accounts?f=never${group ? `&group=${group.id}` : ""}`, label: "Кто не входил" }, { href: "/staff/students/accounts", label: "Все аккаунты" }],
    );
  }

  // расписание группы
  if (group && hasAny(m, "расписан", "пара", "пары", "завтра", "сегодня", "аудитор", "занят")) {
    const day = parseDay(message) ?? moscowToday();
    const lessons = await prisma.lesson.findMany({ where: { groupId: group.id, date: day }, orderBy: { startTime: "asc" }, select: { startTime: true, room: true, status: true, subgroup: true, changeNote: true, course: { select: { name: true } }, teacher: { select: { fullName: true } } } });
    if (!lessons.length) return r(`У ${group.name} ${fmtDay(day).toLowerCase()} пар нет.`);
    return r(
      `${group.name}, ${fmtDay(day).toLowerCase()}:\n${lessons.map((l) => `• ${l.startTime} — ${l.course.name}${l.subgroup ? ` (${l.subgroup} подгр.)` : ""}, ауд. ${l.room}, ${l.teacher.fullName}${l.status === "CANCELLED" ? " — отменена" : l.status === "MOVED" ? ` — ${l.changeNote ?? "перенесена"}` : ""}`).join("\n")}`,
      [{ href: `/staff/schedule?group=${group.id}`, label: "Расписание группы" }],
    );
  }

  // заявки: поиск по фамилии / номеру или сводка
  if (hasAny(m, "заяв", "справк")) {
    const num = m.match(/№\s*(\d+)|\b(\d{2,6})\b/);
    const surname = message.match(/[А-ЯЁ][а-яё]{2,}(?:ой|ова|ева|ина|ин|ов|ев|ий|ая|ко|ук|юк)?/g)?.filter((w) => !["Найди", "Покажи", "Заявка", "Заявки", "Справка", "Сколько", "Какие"].includes(w));
    const q = num ? (num[1] ?? num[2]) : surname?.[0];
    if (q) {
      // фамилия может быть в косвенном падеже: «заявку Озёрова» → «Озёров»
      let found = (await listRequests(s, { q })).slice(0, 6);
      if (!found.length && /[ауе]$|ой$|ым$/.test(q)) found = (await listRequests(s, { q: q.replace(/(ой|ым|[ауе])$/, "") })).slice(0, 6);
      if (!found.length) return r(`Заявок по запросу «${q}» не нашёл.`);
      return r(
        `Нашёл ${found.length}:\n${found.map((x) => `• №${x.number} «${x.type.title}» — ${x.student.lastName} ${x.student.firstName}, ${x.student.group.name}, ${requestStatusLabel[x.status].toLowerCase()}`).join("\n")}`,
        found.slice(0, 3).map((x) => ({ href: `/staff/requests/${x.id}`, label: `№${x.number}` })),
      );
    }
    const c = ctx.counts;
    const oldest = ctx.newest.at(-1);
    return r(
      `Новых — ${c.NEW ?? 0}, в работе — ${c.IN_REVIEW ?? 0}, ждут студента — ${c.NEED_INFO ?? 0}, готовы к выдаче — ${c.READY ?? 0}.` + (oldest ? `\nСамая давняя новая: №${oldest.number} «${oldest.type.title}», ${oldest.student.lastName} ${oldest.student.firstName}, ${relativeTime(oldest.createdAt)}.` : ""),
      [{ href: "/staff", label: "Открыть заявки" }, ...(oldest ? [{ href: `/staff/requests/${oldest.id}`, label: `Заявка №${oldest.number}` }] : [])],
    );
  }

  // студент по фамилии
  const word = message.match(/[А-ЯЁ][а-яё]{3,}/g)?.find((w) => !["Найди", "Покажи", "Открой", "Студент", "Студентка", "Личное", "Где", "Кто"].includes(w));
  if (word && hasAny(m, "студент", "найди", "личное дело", "покажи", "открой")) {
    const st = await prisma.student.findMany({ where: { ...studentScope(s), OR: variants(word).map((v) => ({ lastName: { contains: v } })) }, take: 5, select: { id: true, lastName: true, firstName: true, group: { select: { name: true } } } });
    if (!st.length) return r(`Студентов с фамилией «${word}» в вашей области нет.`);
    return r(`Нашёл: ${st.map((x) => `${x.lastName} ${x.firstName} (${x.group.name})`).join(", ")}.`, st.map((x) => ({ href: `/staff/students/${x.id}`, label: `${x.lastName} ${x.firstName[0]}.` })));
  }

  return r(
    `Здравствуйте! Я помогаю с рутиной деканата. Могу:\n• рассказать о заявках: «сколько новых заявок», «найди заявку Озёрова», «заявка № 12»\n• показать расписание группы: «пары ИВТ-24-1 завтра»\n• подсказать по аккаунтам и фото: «кто из ИВТ-24-1 не входил»\n• подготовить объявление: «объяви ИВТ-24-1: лекция в понедельник переносится в 401»\n• перенести пару: «перенеси пару ИВТ-24-1 по дискретной математике со среды на пятницу 12:20 в 401, причина: конференция»\n\nЯ только готовлю черновик — публикуете вы.`,
  );
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

export async function staffReply(history: ChatMsg[], ctx: StaffContext): Promise<StaffReply> {
  const last = history[history.length - 1]?.content ?? "";
  const system = `Ты — помощник сотрудника деканата «Универа». Отвечай по-русски, кратко, деловым тоном.
Используй только данные из контекста; не выдумывай номера заявок и фамилии.
Сам ты ничего не публикуешь и не меняешь. Если просят объявление — подготовь черновик, его опубликует сотрудник кнопкой.
Черновик: {"kind":"ANNOUNCEMENT","audience":"GROUP"|"FACULTY"|"ALL","groupId":"<id группы или пусто>","title":"...","body":"..."}.
Ответ — строго JSON: {"text":"...","draft": {...} | null}

Группы (id — название):
${ctx.groups.map((g) => `${g.id} — ${g.name}`).join("\n")}

КОНТЕКСТ:
${ctx.text}`;
  // перенос пары разбираем правилами и в режиме модели: нужно точно найти занятие в расписании
  if (hasAny(norm(last), "перенес", "перенос", "переставь", "передвинь")) return rulesStaff(last, ctx);
  const g = await gatewayJson(system, history);
  if (g) return { text: g.text, draft: sanitize(g.draft, ctx), source: "gateway" };
  return rulesStaff(last, ctx);
}

