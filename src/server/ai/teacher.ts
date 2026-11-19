import "server-only";
/**
 * Помощник преподавателя. Видит только его данные: пары текущего периода, группы, задания и сдачи.
 * Умеет: расписание, сводки (кто не сдал, что ждёт проверки, посещаемость), черновик домашнего задания.
 * Задание выдаёт не помощник, а кнопка «Выдать» после проверки преподавателем. Оценки не ставит (решение команды).
 */
import { z } from "zod";
import { prisma } from "../db";
import { currentPeriod, type SessionTeacher } from "../repos/teacher";
import { addDays, fmtDateTime, fmtDay, moscowTime, moscowToday, plural } from "@/lib/utils";
import { examplesOf, classifyWithModel, route, type Suggestion, type Tool, type ToolResult, type Widget } from "./router";
import { bestMentions, findGroup, gatewayJson, hasAny, norm, parseDay, parseDue, type AiLink, type ChatMsg } from "./common";

export type AssignmentDraft = { kind: "ASSIGNMENT"; groupId: string; courseId: string; title: string; description: string; dueAt: string };
/** Сообщение одному студенту (личный диалог) или напоминание группе (уведомление всем студентам группы). */
export type MessageDraft = { kind: "MESSAGE"; mode: "STUDENT" | "GROUP"; studentUserId: string; groupId: string; subject: string; body: string };
export type TeacherReply = { text: string; draft?: AssignmentDraft | MessageDraft; links?: AiLink[]; widget?: Widget; suggestions?: Suggestion[]; source: "gateway" | "rules"; via?: string };

/** Студент из фразы по фамилии в любом падеже: «Зорину», «Лесновой» → по основе фамилии. */
function findStudent(text: string, students: TeacherContextLite["students"]) {
  const t = norm(text);
  const hits = students.filter((s) => {
    const ln = norm(s.lastName);
    const base = ln.length > 5 ? ln.slice(0, ln.length - 2) : ln.slice(0, Math.max(4, ln.length - 1));
    return new RegExp(`(^|[^а-я])${base}`).test(t);
  });
  // однофамильцы — уточняем по имени; не уточнили — не угадываем, преподаватель выберет в карточке
  if (hits.length > 1) {
    const byName = hits.find((s) => t.includes(norm(s.firstName).slice(0, 4)));
    return byName ? { hit: byName, namesakes: [] } : { hit: undefined, namesakes: hits };
  }
  return { hit: hits[0], namesakes: [] };
}
type TeacherContextLite = { students: { userId: string; lastName: string; firstName: string; groupId: string }[] };

/** Черновик сообщения: кому (студент или группа), тема, текст. Про задание — подставляем его срок. */
export function messageFromText(text: string, ctx: TeacherContext): MessageDraft {
  const found = findStudent(text, ctx.students);
  const student = found.hit;
  const namesakes = found.namesakes.length > 1;
  const group = findGroup(text, ctx.groups) ?? (student || namesakes ? undefined : ctx.groups.length === 1 ? ctx.groups[0] : undefined);
  const t = norm(text);
  const num = t.match(/(?:лаб[а-я]*|работ[а-я]*|задани[а-я]*|№)\s*№?\s*(\d+)/)?.[1];
  const gid = student?.groupId ?? group?.id;
  const a = num ? ctx.assignments.find((x) => x.groupId === gid && new RegExp(`№\\s*${num}(?!\\d)`).test(x.title)) : undefined;
  // \b в JS не работает с кириллицей — граница слова через пробел
  const said = text.match(/[:—]\s*([\s\S]{3,})$/)?.[1] ?? text.match(/(?:^|\s)что\s+([\s\S]{3,})$/i)?.[1];
  const body = said ? said.trim().replace(/^./, (c) => c.toUpperCase()) : a ? `Напоминаю: «${a.title}» нужно сдать до ${fmtDateTime(a.dueAt)}.` : "";
  return {
    kind: "MESSAGE",
    mode: student || namesakes ? "STUDENT" : "GROUP",
    studentUserId: student?.userId ?? "",
    groupId: student || namesakes ? "" : (group?.id ?? ""),
    subject: a ? `«${a.title}»` : hasAny(t, "напомн") ? "Напоминание" : "Сообщение от преподавателя",
    body,
  };
}

export async function buildTeacherContext(t: SessionTeacher & { fullName: string }) {
  const today = moscowToday();
  const [pairsRaw, lessons, assignments, pending] = await Promise.all([
    prisma.lesson.findMany({ where: { teacherId: t.id, ...currentPeriod() }, distinct: ["groupId", "courseId"], select: { group: { select: { id: true, name: true } }, course: { select: { id: true, name: true } } } }),
    prisma.lesson.findMany({ where: { teacherId: t.id, date: { gte: today, lt: addDays(today, 8) } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], select: { id: true, date: true, startTime: true, endTime: true, room: true, status: true, changeNote: true, subgroup: true, group: { select: { id: true, name: true } }, course: { select: { name: true } } } }),
    prisma.assignment.findMany({ where: { teacherId: t.id }, orderBy: { dueAt: "desc" }, take: 30, select: { id: true, title: true, dueAt: true, groupId: true, courseId: true, group: { select: { name: true } }, course: { select: { name: true } }, _count: { select: { submissions: true } } } }),
    prisma.submission.findMany({ where: { status: "SUBMITTED", assignment: { teacherId: t.id } }, orderBy: { submittedAt: "asc" }, take: 50, select: { submittedAt: true, student: { select: { lastName: true, firstName: true } }, assignment: { select: { id: true, title: true, groupId: true, courseId: true, group: { select: { name: true } } } } } }),
  ]);
  const pairs = pairsRaw.map((p) => ({ groupId: p.group.id, groupName: p.group.name, courseId: p.course.id, courseName: p.course.name })).sort((a, b) => a.groupName.localeCompare(b.groupName, "ru"));
  const groups = [...new Map(pairs.map((p) => [p.groupId, { id: p.groupId, name: p.groupName }])).values()];
  const students = await prisma.student.findMany({ where: { groupId: { in: groups.map((g) => g.id) } }, orderBy: { lastName: "asc" }, select: { userId: true, lastName: true, firstName: true, groupId: true } });

  const lines: string[] = [];
  lines.push(`Преподаватель: ${t.fullName}. Сегодня: ${fmtDay(today)}.`);
  lines.push(`Группы и дисциплины: ${pairs.map((p) => `${p.groupName} — ${p.courseName}`).join("; ") || "нет"}.`);
  lines.push("Пары на 7 дней:");
  for (const l of lessons) lines.push(`- ${fmtDay(l.date)} ${l.startTime}: ${l.course.name}, ${l.group.name}${l.subgroup ? ` (подгр. ${l.subgroup})` : ""}, ауд. ${l.room}${l.status === "CANCELLED" ? " [ОТМЕНЕНА]" : l.status === "MOVED" ? ` [ПЕРЕНЕСЕНА: ${l.changeNote ?? ""}]` : ""}`);
  if (!lessons.length) lines.push("- пар нет");
  lines.push(`Ждут проверки: ${pending.length}.`);
  lines.push(`Задания: ${assignments.slice(0, 12).map((a) => `«${a.title}» (${a.group.name}, до ${fmtDateTime(a.dueAt)}, сдали ${a._count.submissions})`).join("; ") || "нет"}.`);
  return { text: lines.join("\n"), pairs, groups, students, lessons, assignments, pending, fullName: t.fullName, teacherId: t.id };
}
export type TeacherContext = Awaited<ReturnType<typeof buildTeacherContext>>;

const hw = (a: { groupId: string; courseId: string; id: string }) => `/teacher/${a.groupId}/${a.courseId}/homework/${a.id}`;

/** Черновик задания из фразы: группа, дисциплина, название, срок. Неясное — пусто, преподаватель выберет в карточке. */
export function assignmentFromText(text: string, ctx: TeacherContext): AssignmentDraft {
  const t = norm(text);
  const group = findGroup(text, ctx.groups) ?? (ctx.groups.length === 1 ? ctx.groups[0] : undefined);
  const forGroup = ctx.pairs.filter((p) => !group || p.groupId === group.id);
  const pair = bestMentions(text, forGroup, (p) => p.courseName)[0] ?? (forGroup.length === 1 ? forGroup[0] : undefined);
  const lab = t.match(/лаб[а-я]*(?:\s+работ[а-я]*)?\s*№?\s*(\d+)/); // \w в JS не ловит кириллицу
  const quoted = text.match(/[«"]([^»"]{2,150})[»"]/);
  const title = quoted?.[1] ?? (lab ? `Лабораторная №${lab[1]}` : hasAny(t, "контрольн") ? "Контрольная работа" : hasAny(t, "реферат") ? "Реферат" : hasAny(t, "эссе") ? "Эссе" : hasAny(t, "курсов") ? "Курсовая работа" : "Домашнее задание");
  const description = (text.match(/[:—]\s*([\s\S]{5,})$/)?.[1].trim() ?? "").replace(/^./, (c) => c.toUpperCase());
  return { kind: "ASSIGNMENT", groupId: group?.id ?? pair?.groupId ?? "", courseId: pair?.courseId ?? "", title, description, dueAt: parseDue(text) };
}

const hwLink = (a: { groupId: string; courseId: string; id: string }) => hw(a);

/** «Не было Зорина и Лесновой» → подставить в поле распознавания отметки (сохраняет преподаватель). */
const absentPhrase = (msg: string): Record<string, string> => (/не было|нет\s|отсутств|не пришл/i.test(msg) ? { phrase: msg.slice(0, 200) } : {});

/** Пара для отметки: названная группа/дисциплина сегодня; иначе — идущая или последняя начавшаяся сегодня. */
function lessonToMark(message: string, ctx: TeacherContext) {
  const today = moscowToday().getTime();
  const todays = ctx.lessons.filter((l) => l.date.getTime() === today && l.status !== "CANCELLED");
  const group = findGroup(message, ctx.groups);
  const pool = group ? todays.filter((l) => l.group.id === group.id) : todays;
  const byCourse = bestMentions(message, pool, (l) => l.course.name);
  if (byCourse.length) return byCourse[0];
  const now = moscowTime();
  const started = pool.filter((l) => l.startTime <= now);
  return started.at(-1) ?? pool[0];
}

/**
 * Инструменты помощника преподавателя: расписание, отметка посещаемости, проверка работ (мини-разделы в чате),
 * «кто не сдал», выдать задание и написать студентам (черновики), посещаемость групп.
 */
export const teacherTools: Tool<TeacherContext>[] = [
  {
    name: "schedule",
    title: "Расписание",
    keywords: [["распис", 3], ["пары", 2], ["пара ", 1.5], ["какие пары", 2], ["аудитор", 2], ["завтра", 1], ["сегодня", 1], ["где пара", 2], ["во сколько", 1.5]],
    examples: ["Какие у меня пары завтра?", "Расписание на сегодня", "Где пара у ИВТ-24-1?"],
    not: ["посещаем", "отмет", "нет на паре", "не было"],
    run: (msg, ctx) => {
      const day = parseDay(msg) ?? moscowToday();
      const n = ctx.lessons.filter((l) => l.date.getTime() === day.getTime() && l.status !== "CANCELLED").length;
      return {
        text: n ? `${n} ${plural(n, "пара", "пары", "пар")}. Посещаемость можно отметить прямо здесь.` : "В этот день пар нет.",
        widget: { type: "teacher.day", params: { date: day.toISOString().slice(0, 10) } },
      };
    },
  },
  {
    name: "mark",
    title: "Отметить посещаемость",
    keywords: [["отметь", 3], ["отметить", 3], ["посещаемость на", 3], ["кто был", 3], ["нет на паре", 4], ["не было", 3], ["отсутству", 3], ["перекличк", 4]],
    examples: ["Отметь посещаемость на текущей паре", "На паре не было Зорина", "Перекличка"],
    run: async (msg, ctx): Promise<ToolResult> => {
      const l = lessonToMark(msg, ctx);
      if (!l) {
        // сегодня пар нет — предлагаем последнюю прошедшую неотмеченную пару (за 2 недели)
        const today = moscowToday();
        const where = { teacherId: ctx.teacherId, status: { not: "CANCELLED" as const }, date: { lt: today, gte: addDays(today, -14) } };
        const sel = { id: true, date: true, startTime: true, course: { select: { name: true } }, group: { select: { name: true } } } as const;
        const order = [{ date: "desc" as const }, { startTime: "desc" as const }];
        const unmarked = await prisma.lesson.findFirst({ where: { ...where, attendance: { none: {} } }, orderBy: order, select: sel });
        // всё отмечено — открываем последнюю прошедшую пару: отметки можно поправить («не было Зорина» вчера)
        const past = unmarked ?? (await prisma.lesson.findFirst({ where, orderBy: order, select: sel }));
        if (!past) return { text: "Сегодня пар нет, прошедших пар за две недели тоже нет." };
        const when = `${past.course.name}, ${past.group.name}, ${fmtDay(past.date).toLowerCase()}, ${past.startTime}`;
        return {
          text: unmarked ? `Сегодня пар нет. Не отмечена прошедшая пара: ${when}. Отметьте здесь — сохраняете вы.` : `Сегодня пар нет. Последняя пара — ${when}; отметки можно поправить здесь.`,
          widget: { type: "teacher.attendance", params: { lessonId: past.id, ...absentPhrase(msg) } },
        };
      }
      return {
        text: `${l.course.name}, ${l.group.name}, ${l.startTime}. По умолчанию все «были» — нажмите на тех, кого нет, или напишите в поле «нет Зорина и Лесновой». Сохраняете вы.`,
        widget: { type: "teacher.attendance", params: { lessonId: l.id, ...absentPhrase(msg) } },
      };
    },
  },
  {
    name: "reviews",
    title: "Проверить работы",
    keywords: [["провер", 3], ["ждут", 2], ["непровер", 3], ["на проверке", 3], ["сдали работ", 2]],
    examples: ["Что ждёт проверки?", "Покажи работы на проверке"],
    not: ["не сдал", "кто сдал"],
    run: (_msg, ctx) => ({
      text: ctx.pending.length ? `Ждут проверки ${ctx.pending.length} ${plural(ctx.pending.length, "работа", "работы", "работ")}. Принять или вернуть на доработку можно прямо здесь; оценку ставите вы в журнале.` : "Все сданные работы проверены — новых нет.",
      widget: ctx.pending.length ? { type: "teacher.reviews", params: {} } : undefined,
    }),
  },
  {
    name: "missing",
    title: "Кто не сдал",
    keywords: [["не сдал", 4], ["кто сдал", 4], ["сдали ли", 4], ["не прислал", 4], ["должник", 3]],
    examples: ["Кто не сдал лабораторную №5?", "Сдали ли ИВТ-24-1 лабораторную"],
    run: async (message, ctx) => {
      const m = norm(message);
      const group = findGroup(message, ctx.groups);
      const num = m.match(/№?\s*(\d+)/)?.[1];
      // одно и то же задание может быть у нескольких групп — показываем все (если группа названа — только её)
      const numRe = num ? new RegExp(`№\\s*${num}(?!\\d)`) : null;
      const found = ctx.assignments.filter((x) => (!group || x.groupId === group.id) && (!numRe || numRe.test(x.title)) && x.dueAt <= addDays(new Date(), 30));
      const list = num ? found.slice(0, 4) : found.slice(0, 1);
      if (!list.length) return { text: "Не нашёл такое задание. Уточните номер или название, например: «кто не сдал лабораторную №5 в ИВТ-24-1»." };
      const names = (xs: { lastName: string; firstName: string }[]) => xs.map((s) => `${s.lastName} ${s.firstName[0]}.`).join(", ");
      const parts = await Promise.all(
        list.map(async (a) => {
          const students = await prisma.student.findMany({ where: { groupId: a.groupId }, orderBy: { lastName: "asc" }, select: { lastName: true, firstName: true, submissions: { where: { assignmentId: a.id }, select: { status: true } } } });
          const missing = students.filter((s) => !s.submissions.length);
          const ret = students.filter((s) => s.submissions[0]?.status === "RETURNED");
          return `«${a.title}», ${a.group.name} (срок ${fmtDateTime(a.dueAt)}):\n` + (missing.length ? `Не сдали — ${missing.length}: ${names(missing)}` : "Сдали все.") + (ret.length ? `\nНа доработке: ${names(ret)}` : "");
        }),
      );
      const g0 = list[0];
      return {
        text: parts.join("\n\n"),
        links: list.map((a) => ({ href: hwLink(a), label: list.length > 1 ? `Открыть: ${a.group.name}` : "Открыть задание" })),
        suggestions: [{ label: `Напомнить ${g0.group.name}`, message: `Напомни ${g0.group.name} про «${g0.title}»`, tool: "message" }],
      };
    },
  },
  {
    name: "message",
    title: "Написать студентам",
    keywords: [["напиши", 3], ["напомни", 3], ["сообщи", 3], ["передай", 3], ["предупреди", 3]],
    examples: ["Напиши Никите Зорину, что отчёт нужно доделать", "Напомни ИВТ-24-1 про лабораторную №5"],
    run: (message, ctx) => {
      const d = messageFromText(message, ctx);
      const twins = findStudent(message, ctx.students).namesakes;
      if (twins.length > 1) return { text: `В ваших группах несколько студентов с такой фамилией: ${twins.map((s) => `${s.lastName} ${s.firstName}`).join(", ")}. Выберите нужного в карточке.`, draft: d };
      const st = ctx.students.find((s) => s.userId === d.studentUserId);
      const g = ctx.groups.find((x) => x.id === d.groupId);
      return {
        text:
          d.mode === "STUDENT" && st
            ? `Подготовил сообщение: ${st.lastName} ${st.firstName}. Проверьте текст и нажмите «Отправить» — оно придёт студенту в личные сообщения.`
            : g
              ? `Подготовил напоминание группе ${g.name}. Проверьте текст и нажмите «Отправить» — студенты получат уведомление.`
              : "Подготовил черновик. Выберите студента или группу, проверьте текст и нажмите «Отправить».",
        draft: d,
      };
    },
  },
  {
    name: "assign",
    title: "Выдать задание",
    keywords: [["задай", 4], ["задать", 3], ["выдай", 4], ["выдать", 3], ["назначь", 3], ["новое задание", 4], ["добавь задание", 4], ["дай задание", 4]],
    examples: ["Задай ИВТ-24-1 по алгоритмам лабораторную №6 до пятницы", "Выдай новое задание"],
    run: (message, ctx) => {
      const d = assignmentFromText(message, ctx);
      const pair = ctx.pairs.find((p) => p.groupId === d.groupId && p.courseId === d.courseId);
      return {
        text: pair
          ? `Подготовил задание для ${pair.groupName} по «${pair.courseName}». Проверьте название, описание и срок — и нажмите «Выдать». Файлы можно прикрепить на странице задания.`
          : "Подготовил черновик задания. Выберите группу и дисциплину, проверьте срок — и нажмите «Выдать».",
        draft: d,
      };
    },
  },
  {
    name: "lowattendance",
    title: "Посещаемость групп",
    keywords: [["посещаем", 3], ["пропуска", 2], ["прогул", 3], ["низкая", 2], ["кто пропускает", 4]],
    examples: ["У кого низкая посещаемость?", "Кто пропускает мои пары"],
    not: ["отметь", "отметить", "нет на паре", "не было"],
    run: async (message, ctx) => {
      const group = findGroup(message, ctx.groups);
      const groupIds = group ? [group.id] : ctx.groups.map((g) => g.id);
      const rows = await prisma.attendance.groupBy({ by: ["studentId", "present"], where: { lesson: { teacherId: ctx.teacherId, groupId: { in: groupIds } } }, _count: { _all: true } });
      const m2 = new Map<string, { p: number; t: number }>();
      for (const x of rows) {
        const v = m2.get(x.studentId) ?? { p: 0, t: 0 };
        v.t += x._count._all;
        if (x.present) v.p += x._count._all;
        m2.set(x.studentId, v);
      }
      const low = [...m2].filter(([, v]) => v.t >= 3 && v.p / v.t < 0.8);
      if (!low.length) return { text: group ? `В ${group.name} у всех посещаемость ваших пар 80 % и выше.` : "У всех студентов посещаемость ваших пар 80 % и выше." };
      const st = await prisma.student.findMany({ where: { id: { in: low.map(([id]) => id) } }, select: { id: true, lastName: true, firstName: true, group: { select: { name: true } } } });
      const lines = low
        .map(([id, v]) => ({ s: st.find((x) => x.id === id)!, pct: Math.round((v.p / v.t) * 100), v }))
        .sort((a, b) => a.pct - b.pct)
        .map((x) => `• ${x.s.lastName} ${x.s.firstName[0]}., ${x.s.group.name} — ${x.pct} % (${x.v.p}/${x.v.t})`);
      return { text: `Посещаемость ниже 80 % на ваших парах:\n${lines.join("\n")}` };
    },
  },
];

const teacherHelp = (): ToolResult => ({
  text: "Здравствуйте! Я помогаю с рутиной преподавателя: расписание, отметка посещаемости и проверка работ прямо в чате, «кто не сдал», выдать задание, написать студенту или напомнить группе. Оценки я не ставлю — это решение преподавателя.",
  suggestions: examplesOf(teacherTools, ["schedule", "mark", "reviews", "missing", "assign", "message"]),
});

export async function rulesTeacher(message: string, ctx: TeacherContext, forced?: string): Promise<TeacherReply> {
  const r = await route(message, teacherTools, ctx, { forced, help: teacherHelp, classify: classifyWithModel });
  return { text: r.text, draft: r.draft as AssignmentDraft | MessageDraft | undefined, links: r.links, widget: r.widget, suggestions: r.suggestions, source: "rules", via: r.via };
}

const draftSchema = z.object({ kind: z.literal("ASSIGNMENT"), groupId: z.string().max(40), courseId: z.string().max(40), title: z.string().max(150), description: z.string().max(4000), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) });

const messageSchema = z.object({ kind: z.literal("MESSAGE"), mode: z.enum(["STUDENT", "GROUP"]), studentUserId: z.string().max(40).default(""), groupId: z.string().max(40).default(""), subject: z.string().max(150), body: z.string().max(4000) });

/** Черновик модели проверяется: только пары, группы и студенты этого преподавателя, иначе поля пустые. */
function sanitize(d: unknown, ctx: TeacherContext): AssignmentDraft | MessageDraft | undefined {
  const msg = messageSchema.safeParse(d);
  if (msg.success) {
    return {
      ...msg.data,
      studentUserId: ctx.students.some((s) => s.userId === msg.data.studentUserId) ? msg.data.studentUserId : "",
      groupId: ctx.groups.some((g) => g.id === msg.data.groupId) ? msg.data.groupId : "",
    };
  }
  const p = draftSchema.safeParse(d);
  if (!p.success) return undefined;
  const pair = ctx.pairs.find((x) => x.groupId === p.data.groupId && x.courseId === p.data.courseId);
  return { ...p.data, groupId: pair?.groupId ?? "", courseId: pair?.courseId ?? "" };
}

/** Сначала правила (распознавание инструмента); что не узнали — модели через шлюз (если подключена). */
export async function teacherReply(history: ChatMsg[], ctx: TeacherContext, forced?: string): Promise<TeacherReply> {
  const last = history[history.length - 1]?.content ?? "";
  const viaRules = await rulesTeacher(last, ctx, forced);
  if (viaRules.via !== "help") return viaRules;
  const system = `Ты — помощник преподавателя в цифровом деканате «Универа». Отвечай по-русски, кратко, на «вы».
Используй только данные из контекста. Не выставляй и не обсуждай изменение оценок — это решает преподаватель.
Если преподаватель просит выдать домашнее задание — подготовь черновик (сам ты ничего не выдаёшь, под ответом появится карточка с кнопкой «Выдать»).
Черновик: {"kind":"ASSIGNMENT","groupId":"<id из списка пар>","courseId":"<id>","title":"...","description":"...","dueAt":"YYYY-MM-DDTHH:mm"} (время московское).
Если просит написать студенту или напомнить группе — {"kind":"MESSAGE","mode":"STUDENT"|"GROUP","studentUserId":"<id студента>","groupId":"<id группы>","subject":"...","body":"..."}; отправляет преподаватель кнопкой.

Студенты (userId — фамилия имя — группа):
${ctx.students.map((s) => `${s.userId} — ${s.lastName} ${s.firstName} — ${ctx.groups.find((g) => g.id === s.groupId)?.name ?? ""}`).join("\n")}
Ответ — строго JSON: {"text":"...","draft": {...} | null}

Пары (groupId|courseId — группа — дисциплина):
${ctx.pairs.map((p) => `${p.groupId}|${p.courseId} — ${p.groupName} — ${p.courseName}`).join("\n")}

КОНТЕКСТ:
${ctx.text}`;
  const g = await gatewayJson(system, history);
  if (g) return { text: g.text, draft: sanitize(g.draft, ctx), source: "gateway" };
  return viaRules;
}
