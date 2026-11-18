import "server-only";
/**
 * Помощник преподавателя. Видит только его данные: пары текущего периода, группы, задания и сдачи.
 * Умеет: расписание, сводки (кто не сдал, что ждёт проверки, посещаемость), черновик домашнего задания.
 * Задание выдаёт не помощник, а кнопка «Выдать» после проверки преподавателем. Оценки не ставит (решение команды).
 */
import { z } from "zod";
import { prisma } from "../db";
import { currentPeriod, type SessionTeacher } from "../repos/teacher";
import { addDays, fmtDateTime, fmtDay, moscowToday, plural } from "@/lib/utils";
import { findGroup, gatewayJson, hasAny, mentions, norm, parseDay, parseDue, type AiLink, type ChatMsg } from "./common";

export type AssignmentDraft = { kind: "ASSIGNMENT"; groupId: string; courseId: string; title: string; description: string; dueAt: string };
export type TeacherReply = { text: string; draft?: AssignmentDraft; links?: AiLink[]; source: "gateway" | "rules" };

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

  const lines: string[] = [];
  lines.push(`Преподаватель: ${t.fullName}. Сегодня: ${fmtDay(today)}.`);
  lines.push(`Группы и дисциплины: ${pairs.map((p) => `${p.groupName} — ${p.courseName}`).join("; ") || "нет"}.`);
  lines.push("Пары на 7 дней:");
  for (const l of lessons) lines.push(`- ${fmtDay(l.date)} ${l.startTime}: ${l.course.name}, ${l.group.name}${l.subgroup ? ` (подгр. ${l.subgroup})` : ""}, ауд. ${l.room}${l.status === "CANCELLED" ? " [ОТМЕНЕНА]" : l.status === "MOVED" ? ` [ПЕРЕНЕСЕНА: ${l.changeNote ?? ""}]` : ""}`);
  if (!lessons.length) lines.push("- пар нет");
  lines.push(`Ждут проверки: ${pending.length}.`);
  lines.push(`Задания: ${assignments.slice(0, 12).map((a) => `«${a.title}» (${a.group.name}, до ${fmtDateTime(a.dueAt)}, сдали ${a._count.submissions})`).join("; ") || "нет"}.`);
  return { text: lines.join("\n"), pairs, groups, lessons, assignments, pending, fullName: t.fullName, teacherId: t.id };
}
export type TeacherContext = Awaited<ReturnType<typeof buildTeacherContext>>;

const hw = (a: { groupId: string; courseId: string; id: string }) => `/teacher/${a.groupId}/${a.courseId}/homework/${a.id}`;

/** Черновик задания из фразы: группа, дисциплина, название, срок. Неясное — пусто, преподаватель выберет в карточке. */
export function assignmentFromText(text: string, ctx: TeacherContext): AssignmentDraft {
  const t = norm(text);
  const group = findGroup(text, ctx.groups) ?? (ctx.groups.length === 1 ? ctx.groups[0] : undefined);
  const forGroup = ctx.pairs.filter((p) => !group || p.groupId === group.id);
  const pair = forGroup.find((p) => mentions(text, p.courseName)) ?? (forGroup.length === 1 ? forGroup[0] : undefined);
  const lab = t.match(/лаб[а-я]*(?:\s+работ[а-я]*)?\s*№?\s*(\d+)/); // \w в JS не ловит кириллицу
  const quoted = text.match(/[«"]([^»"]{2,150})[»"]/);
  const title = quoted?.[1] ?? (lab ? `Лабораторная №${lab[1]}` : hasAny(t, "контрольн") ? "Контрольная работа" : hasAny(t, "реферат") ? "Реферат" : hasAny(t, "эссе") ? "Эссе" : hasAny(t, "курсов") ? "Курсовая работа" : "Домашнее задание");
  const description = (text.match(/[:—]\s*([\s\S]{5,})$/)?.[1].trim() ?? "").replace(/^./, (c) => c.toUpperCase());
  return { kind: "ASSIGNMENT", groupId: group?.id ?? pair?.groupId ?? "", courseId: pair?.courseId ?? "", title, description, dueAt: parseDue(text) };
}

export async function rulesTeacher(message: string, ctx: TeacherContext): Promise<TeacherReply> {
  const m = norm(message);
  const group = findGroup(message, ctx.groups);
  const r = (text: string, links?: AiLink[], draft?: AssignmentDraft): TeacherReply => ({ text, links, draft, source: "rules" });

  // кто не сдал / сдал задание
  if (hasAny(m, "не сдал", "кто сдал", "сдали ли", "не прислал")) {
    const num = m.match(/№?\s*(\d+)/)?.[1];
    // одно и то же задание может быть у нескольких групп — показываем все (если группа названа — только её)
    const numRe = num ? new RegExp(`№\\s*${num}(?!\\d)`) : null;
    const found = ctx.assignments.filter((x) => (!group || x.groupId === group.id) && (!numRe || numRe.test(x.title)) && x.dueAt <= addDays(new Date(), 30));
    const list = num ? found.slice(0, 4) : found.slice(0, 1);
    if (!list.length) return r("Не нашёл такое задание. Уточните номер или название, например: «кто не сдал лабораторную №5 в ИВТ-24-1».");
    const names = (xs: { lastName: string; firstName: string }[]) => xs.map((s) => `${s.lastName} ${s.firstName[0]}.`).join(", ");
    const parts = await Promise.all(
      list.map(async (a) => {
        const students = await prisma.student.findMany({ where: { groupId: a.groupId }, orderBy: { lastName: "asc" }, select: { lastName: true, firstName: true, submissions: { where: { assignmentId: a.id }, select: { status: true } } } });
        const missing = students.filter((s) => !s.submissions.length);
        const ret = students.filter((s) => s.submissions[0]?.status === "RETURNED");
        return `«${a.title}», ${a.group.name} (срок ${fmtDateTime(a.dueAt)}):\n` + (missing.length ? `Не сдали — ${missing.length}: ${names(missing)}` : "Сдали все.") + (ret.length ? `\nНа доработке: ${names(ret)}` : "");
      }),
    );
    return r(parts.join("\n\n"), list.map((a) => ({ href: hw(a), label: list.length > 1 ? `Открыть: ${a.group.name}` : "Открыть задание" })));
  }

  // что ждёт проверки
  if (hasAny(m, "провер", "ждут", "непровер", "на проверке")) {
    if (!ctx.pending.length) return r("Все сданные работы проверены — новых нет.");
    const by = new Map<string, { a: (typeof ctx.pending)[number]["assignment"]; names: string[] }>();
    for (const p of ctx.pending) {
      const x = by.get(p.assignment.id) ?? { a: p.assignment, names: [] };
      x.names.push(`${p.student.lastName} ${p.student.firstName[0]}.`);
      by.set(p.assignment.id, x);
    }
    const list = [...by.values()];
    return r(
      `Ждут проверки ${ctx.pending.length} ${plural(ctx.pending.length, "работа", "работы", "работ")}:\n${list.map((x) => `• «${x.a.title}», ${x.a.group.name} — ${x.names.join(", ")}`).join("\n")}`,
      list.slice(0, 3).map((x) => ({ href: hw(x.a), label: `Проверить: ${x.a.group.name}, «${x.a.title.length > 24 ? x.a.title.slice(0, 22) + "…" : x.a.title}»` })),
    );
  }

  // выдать задание
  if (hasAny(m, "задай", "задать", "выдай", "выдать", "назначь", "дай задание", "домашн", "новое задание", "добавь задание")) {
    const d = assignmentFromText(message, ctx);
    const pair = ctx.pairs.find((p) => p.groupId === d.groupId && p.courseId === d.courseId);
    return r(
      pair
        ? `Подготовил задание для ${pair.groupName} по «${pair.courseName}». Проверьте название, описание и срок — и нажмите «Выдать». Файлы можно прикрепить на странице задания.`
        : "Подготовил черновик задания. Выберите группу и дисциплину, проверьте срок — и нажмите «Выдать».",
      undefined,
      d,
    );
  }

  // посещаемость
  if (hasAny(m, "посещаем", "пропуска", "прогул")) {
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
    if (!low.length) return r(group ? `В ${group.name} у всех посещаемость ваших пар 80 % и выше.` : "У всех студентов посещаемость ваших пар 80 % и выше.");
    const st = await prisma.student.findMany({ where: { id: { in: low.map(([id]) => id) } }, select: { id: true, lastName: true, firstName: true, group: { select: { name: true } } } });
    const lines = low
      .map(([id, v]) => ({ s: st.find((x) => x.id === id)!, pct: Math.round((v.p / v.t) * 100), v }))
      .sort((a, b) => a.pct - b.pct)
      .map((x) => `• ${x.s.lastName} ${x.s.firstName[0]}., ${x.s.group.name} — ${x.pct} % (${x.v.p}/${x.v.t})`);
    return r(`Посещаемость ниже 80 % на ваших парах:\n${lines.join("\n")}`);
  }

  // расписание
  if (hasAny(m, "расписан", "пара", "пары", "завтра", "сегодня", "недел", "аудитор", "где")) {
    const day = parseDay(message);
    const pool = ctx.lessons.filter((l) => (!day || l.date.getTime() === day.getTime()) && (!group || l.group.id === group.id));
    const active = pool.filter((l) => l.status !== "CANCELLED");
    const when = day ? fmtDay(day).toLowerCase() : "ближайшие дни";
    if (!active.length) return r(`${group ? `У ${group.name} с вами` : "У вас"} на ${when} пар нет.`);
    const shown = active.slice(0, day ? 10 : 6);
    const changed = pool.filter((l) => l.status !== "SCHEDULED");
    return r(
      `${day ? `${fmtDay(day)}:` : "Ближайшие пары:"}\n${shown.map((l) => `• ${day ? "" : fmtDay(l.date) + ", "}${l.startTime} — ${l.course.name}, ${l.group.name}${l.subgroup ? ` (${l.subgroup} подгр.)` : ""}, ауд. ${l.room}${l.status === "MOVED" ? " (перенесена)" : ""}`).join("\n")}` +
        (changed.length ? `\n\nИзменения: ${changed.map((l) => `${l.course.name} ${fmtDay(l.date).toLowerCase()} — ${l.status === "CANCELLED" ? "отменена" : (l.changeNote ?? "перенесена")}`).join("; ")}.` : ""),
      shown[0] ? [{ href: `/teacher/lesson/${shown[0].id}`, label: "Отметить посещаемость на паре" }] : undefined,
    );
  }

  return r(
    `Здравствуйте! Я помогаю с рутиной преподавателя. Могу:\n• показать расписание: «какие пары завтра», «где пара у ИВТ-24-1»\n• выдать домашнее задание: «задай ИВТ-24-1 по алгоритмам лабораторную №6 до пятницы»\n• подсказать, что ждёт проверки и кто не сдал задание\n• показать студентов с низкой посещаемостью\n\nОценки я не ставлю — это решение преподавателя.`,
  );
}

const draftSchema = z.object({ kind: z.literal("ASSIGNMENT"), groupId: z.string().max(40), courseId: z.string().max(40), title: z.string().max(150), description: z.string().max(4000), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) });

/** Черновик модели проверяется: только пары этого преподавателя, иначе поля пустые. */
function sanitize(d: unknown, ctx: TeacherContext): AssignmentDraft | undefined {
  const p = draftSchema.safeParse(d);
  if (!p.success) return undefined;
  const pair = ctx.pairs.find((x) => x.groupId === p.data.groupId && x.courseId === p.data.courseId);
  return { ...p.data, groupId: pair?.groupId ?? "", courseId: pair?.courseId ?? "" };
}

export async function teacherReply(history: ChatMsg[], ctx: TeacherContext): Promise<TeacherReply> {
  const last = history[history.length - 1]?.content ?? "";
  const system = `Ты — помощник преподавателя в цифровом деканате «Универа». Отвечай по-русски, кратко, на «вы».
Используй только данные из контекста. Не выставляй и не обсуждай изменение оценок — это решает преподаватель.
Если преподаватель просит выдать домашнее задание — подготовь черновик (сам ты ничего не выдаёшь, под ответом появится карточка с кнопкой «Выдать»).
Черновик: {"kind":"ASSIGNMENT","groupId":"<id из списка пар>","courseId":"<id>","title":"...","description":"...","dueAt":"YYYY-MM-DDTHH:mm"} (время московское).
Ответ — строго JSON: {"text":"...","draft": {...} | null}

Пары (groupId|courseId — группа — дисциплина):
${ctx.pairs.map((p) => `${p.groupId}|${p.courseId} — ${p.groupName} — ${p.courseName}`).join("\n")}

КОНТЕКСТ:
${ctx.text}`;
  const g = await gatewayJson(system, history);
  if (g) return { text: g.text, draft: sanitize(g.draft, ctx), source: "gateway" };
  return rulesTeacher(last, ctx);
}
