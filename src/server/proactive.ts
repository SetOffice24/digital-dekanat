import "server-only";
/**
 * Помощник пишет первым (по мотивам чат-бота Georgia State): раз в день он сам просматривает данные студента
 * и присылает в чат одно сообщение с тем, что важно сейчас, — срок задания, вернули на доработку,
 * экзамен скоро, много пропусков, деканат ждёт ответа, пара отменена, новый материал в библиотеке.
 * Нечего сказать — молчит. Об одном и том же дважды не пишет (NudgeLog).
 * Push — только для срочного (срок меньше суток, экзамен завтра); остальное ждёт в чате.
 * Вечером (после 18:00) — короткое напоминание, только если появилось новое срочное.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { notify } from "./notify";
import { buildStudentContext, type StudentContext } from "./ai/context";
import { freshDocsFor } from "./repos/knowledge";
import type { SessionStudent } from "./repos/student";
import type { Suggestion } from "./ai/router";
import { addDays, fmtDateTime, isoDate, mondayOf, moscowTime, moscowToday } from "@/lib/utils";
import { forecastLabel, isBelow } from "@/lib/grading";
import { expiringDocuments } from "./services/documents";
import { getCase } from "./services/situations";
import { deanery, docKinds } from "@/config/services";

export type Nudge = { key: string; text: string; href: string; label: string; urgent: boolean; weight: number; action?: Suggestion };

const H = 3600_000;
/** Подпись кнопки — по названию, чтобы две ссылки не выглядели одинаково. */
const short = (t: string) => `«${t.length > 26 ? t.slice(0, 24) + "…" : t}»`;
const EXAM_KIND: Record<string, string> = { EXAM: "Экзамен", CREDIT: "Зачёт", RETAKE: "Пересдача" };

/** Что важно студенту сейчас — по его данным (те же репозитории, что и страницы). Самое важное — первым. */
export async function studentNudges(s: SessionStudent, ctx?: StudentContext, now = new Date()): Promise<Nudge[]> {
  const c = ctx ?? (await buildStudentContext(s));
  const today = moscowToday(now);
  const tomorrow = addDays(today, 1);
  const week = isoDate(mondayOf(today));
  const out: Nudge[] = [];

  for (const h of c.openHomework) {
    const hours = (h.dueAt.getTime() - now.getTime()) / H;
    const submit: Suggestion = { label: `Сдать «${h.title.length > 24 ? h.title.slice(0, 22) + "…" : h.title}»`, message: `Сдай ${h.title}`, tool: "submit" };
    if (h.state === "returned")
      out.push({ key: `hw-ret:${h.id}:${h.submission?.submittedAt?.getTime() ?? 0}`, text: `«${h.title}» (${h.course.name}) вернули на доработку — исправьте и отправьте снова.`, href: `/homework/${h.id}`, label: short(h.title), urgent: false, weight: 80, action: submit });
    else if (h.state === "todo" && hours <= 30)
      out.push({ key: `hw-due:${h.id}`, text: `Срок «${h.title}» (${h.course.name}) — ${fmtDateTime(h.dueAt)}, а работа ещё не загружена.`, href: `/homework/${h.id}`, label: short(h.title), urgent: true, weight: 100, action: submit });
    else if (h.state === "overdue" && hours > -7 * 24)
      out.push({ key: `hw-over:${h.id}`, text: `Просрочено «${h.title}» (${h.course.name}). Сдайте как можно скорее — преподаватель ещё может принять.`, href: `/homework/${h.id}`, label: short(h.title), urgent: false, weight: 90, action: submit });
  }

  for (const e of c.exams) {
    const hours = (e.date.getTime() - now.getTime()) / H;
    if (hours <= 0 || hours > 72) continue;
    out.push({ key: `exam:${e.id}`, text: `${EXAM_KIND[e.kind] ?? "Экзамен"} по «${e.course.name}» — ${fmtDateTime(e.date)}, ауд. ${e.room}.`, href: "/grades", label: "Сессия", urgent: hours <= 36, weight: 95 });
  }

  for (const r of c.requests) {
    if (r.status === "NEED_INFO")
      out.push({ key: `req:${r.id}:need:${r.updatedAt.getTime()}`, text: `Деканат ждёт вашего ответа по заявке №${r.number} «${r.type.title}».`, href: `/requests/${r.id}`, label: `Заявка №${r.number}`, urgent: false, weight: 85 });
    else if (r.status === "READY" && r.updatedAt > addDays(now, -3))
      out.push({ key: `req:${r.id}:ready`, text: `Готово: «${r.type.title}» (заявка №${r.number}).`, href: `/requests/${r.id}`, label: `Заявка №${r.number}`, urgent: false, weight: 50 });
  }

  for (const l of c.lessons) {
    if (l.date.getTime() !== tomorrow.getTime() || l.status === "SCHEDULED") continue;
    out.push({
      key: `chg:${l.id}:${l.changedAt?.getTime() ?? 0}`,
      text: l.status === "CANCELLED" ? `Завтра отменена пара «${l.course.name}» в ${l.startTime}.` : `Завтра изменение: «${l.course.name}» — ${l.changeNote ?? `${l.startTime}, ауд. ${l.room}`}.`,
      href: "/schedule",
      label: "Расписание",
      urgent: false,
      weight: 75,
    });
  }

  // посещаемость ниже 75 % (порог допуска из положения) — одним пунктом, даже если дисциплин несколько
  const low = c.attendanceByCourse.filter((a) => a.total >= 4 && a.present / a.total < 0.75);
  if (low.length) {
    const pct = (a: (typeof low)[number]) => Math.round((a.present / a.total) * 100);
    const one = low[0];
    out.push({
      key: `att:${low.map((a) => `${a.name}=${a.total - a.present}`).sort().join("|")}`,
      text:
        low.length === 1
          ? `По «${one.name}» пропущено ${one.total - one.present} из ${one.total} занятий (посещаемость ${pct(one)} %) — ниже 75 %, могут не допустить к экзамену. Если была уважительная причина — подайте заявление.`
          : `Посещаемость ниже 75 % по ${low.length} дисциплинам: ${low.map((a) => `${a.name} (${pct(a)} %)`).join(", ")} — могут не допустить к экзамену. Если была уважительная причина — подайте заявление.`,
      href: "/attendance",
      label: "Посещаемость",
      urgent: false,
      weight: 70,
      action: { label: "Заявление о пропуске", message: "Я пропустил по уважительной причине", tool: "absence" },
    });
  }

  for (const x of c.scores.filter((x) => x.score && isBelow(x.score.forecast)).slice(0, 2))
    out.push({
      key: `risk:${x.courseId}:${week}`,
      text: `По «${x.course}» сейчас ${x.score!.points} из ${x.score!.max} баллов — прогноз ${forecastLabel(x.score!.forecast)}. Стоит подтянуть до сессии.`,
      href: "/grades",
      label: "Оценки",
      urgent: false,
      weight: 60,
      action: { label: "Что подтянуть", message: `Какой прогноз по ${x.course}`, tool: "grades" },
    });

  if (c.debts.length && !c.retakes.length)
    out.push({ key: `debt:${week}`, text: `Есть ${c.debts.length === 1 ? "долг" : "долги"}: ${c.debts.map((d) => d.course).join(", ")}. Пока долг не закрыт, академическая стипендия не назначается.`, href: "/grades", label: "Оценки", urgent: false, weight: 55, action: { label: "Подать на пересдачу", message: "Как пересдать долг?", tool: "retake" } });

  // единое окно: документы со сроком, готовые оригиналы, приём завтра, незавершённые планы, первокурсники
  for (const d of await expiringDocuments(s.id)) {
    const left = Math.ceil(((d.validUntil?.getTime() ?? 0) - now.getTime()) / 86400000);
    out.push({ key: `doc-exp:${d.id}`, text: left > 0 ? `${docKinds[d.kind].title} действует ещё ${left} дн. — загрузите новый заранее, иначе не получится подать заявку (например, на общежитие).` : `${docKinds[d.kind].title}: срок истёк — загрузите новый.`, href: `/services/documents?kind=${d.kind}`, label: "Мои документы", urgent: left <= 3, weight: 65 });
  }
  const svc = await prisma.request.findMany({ where: { studentId: s.id, status: "READY", OR: [{ wantsPaper: true }, { certificate: null }] }, select: { id: true, number: true, type: { select: { title: true } }, appointments: { where: { status: "BOOKED" }, select: { id: true } } } });
  for (const r of svc.filter((x) => !x.appointments.length))
    out.push({ key: `pickup:${r.id}`, text: `«${r.type.title}» (№${r.number}) готова — заберите оригинал в деканате (${deanery.room}). Запишитесь, чтобы прийти без очереди.`, href: `/services/appointments?request=${r.id}&purpose=${encodeURIComponent(`Забрать: ${r.type.title}`)}`, label: "Записаться", urgent: false, weight: 72 });
  const tomorrowAppts = await prisma.appointment.findMany({ where: { studentId: s.id, status: "BOOKED", startsAt: { gte: new Date(tomorrow.getTime() - 3 * H), lt: new Date(tomorrow.getTime() + 21 * H) } }, select: { id: true, startsAt: true, purpose: true } });
  for (const a of tomorrowAppts)
    out.push({ key: `appt:${a.id}`, text: `Завтра приём в деканате: ${fmtDateTime(a.startsAt)}, ${deanery.room} — ${a.purpose}.`, href: "/services/appointments", label: "Мои записи", urgent: false, weight: 88 });
  const cases = await prisma.situationCase.findMany({ where: { studentId: s.id, status: "OPEN", createdAt: { lt: addDays(now, -1) } }, select: { id: true, code: true } });
  for (const cs of cases) {
    const v = await getCase(s, cs.id);
    const next = v?.steps.find((x) => !x.done && !x.optional);
    if (v && next) out.push({ key: `case:${cs.id}:${next.key}:${week}`, text: `План «${v.situation.title}»: осталось ${v.progress.total - v.progress.done} — следующий шаг «${next.title}».`, href: `/services/case/${cs.id}`, label: "Открыть план", urgent: false, weight: 58 });
  }
  if (s.course === 1 && !(await prisma.situationCase.count({ where: { studentId: s.id, code: "freshman" } })))
    out.push({ key: "freshman", text: "Вы на первом курсе — пройдите чек-лист первокурсника: фото для студенческого, документы для стипендии, где деканат и службы.", href: "/requests", label: "Чек-лист", urgent: false, weight: 45, action: { label: "Я первокурсник", message: "Я первокурсник", tool: "situation" } });

  for (const d of await freshDocsFor(c.viewer, addDays(now, -3)))
    out.push({ key: `doc:${d.id}`, text: `Новый материал в библиотеке: «${d.title}»${d.course ? ` (${d.course.name})` : ""}. Спросите меня о нём — отвечу по тексту.`, href: `/library/${d.id}`, label: short(d.title), urgent: false, weight: 40 });

  return out.sort((a, b) => b.weight - a.weight);
}

const greeting = (hhmm: string) => (hhmm < "12:00" ? "Доброе утро" : hhmm < "18:00" ? "Добрый день" : "Добрый вечер");

async function claim(userId: string, key: string) {
  try {
    await prisma.nudgeLog.create({ data: { userId, key } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // уже сделал другой вызов
    throw e;
  }
}

type DigestStudent = SessionStudent & { firstName: string };

/**
 * Сообщение помощника «сам»: утром — сводка того, что важно (до 5 пунктов); вечером — только новое срочное.
 * Возвращает id чата с сообщением или null (рано, уже писал, нечего сказать).
 */
export async function deliverStudentDigest(s: DigestStudent, now = new Date()) {
  const hhmm = moscowTime(now);
  if (hhmm < "07:00") return null;
  const day = isoDate(moscowToday(now));
  const has = async (key: string) => !!(await prisma.nudgeLog.findUnique({ where: { userId_key: { userId: s.userId, key } }, select: { id: true } }));
  let slot: "day" | "eve";
  if (!(await has(`day:${day}`))) slot = "day";
  else if (hhmm >= "18:00" && !(await has(`eve:${day}`))) slot = "eve";
  else return null;
  if (!(await claim(s.userId, `${slot}:${day}`))) return null;
  const written: string[] = [];
  try {
    return await compose(s, slot, day, hhmm, now, written);
  } catch (e) {
    // сбой посередине — снимаем отметки, чтобы следующий обход повторил сводку, а не «проглотил» её
    await prisma.nudgeLog.deleteMany({ where: { userId: s.userId, key: { in: [`${slot}:${day}`, ...written] } } }).catch(() => {});
    throw e;
  }
}

async function compose(s: DigestStudent, slot: "day" | "eve", day: string, hhmm: string, now: Date, written: string[]) {
  // утренняя сводка уже есть в чатах (например, журнал очистили при пересоздании демо-данных) — второй не пишем
  if (slot === "day") {
    const startOfDay = new Date(moscowToday(now).getTime() - 3 * H);
    if (await prisma.aiMessage.count({ where: { proactive: true, chat: { userId: s.userId, title: { startsWith: "Главное" } }, createdAt: { gte: startOfDay } } })) return null;
  }

  const all = await studentNudges(s, undefined, now);
  const candidates = slot === "day" ? all : all.filter((n) => n.urgent);
  const seen = new Set((await prisma.nudgeLog.findMany({ where: { userId: s.userId, key: { in: candidates.map((n) => n.key) } }, select: { key: true } })).map((x) => x.key));
  const fresh = candidates.filter((n) => !seen.has(n.key)).slice(0, 5);
  if (!fresh.length) return null;
  written.push(...fresh.map((n) => n.key));
  await prisma.nudgeLog.createMany({ data: fresh.map((n) => ({ userId: s.userId, key: n.key })), skipDuplicates: true });

  const text =
    slot === "day"
      ? `${greeting(hhmm)}, ${s.firstName}! Я просмотрел ваши дела — вот что важно сейчас:\n${fresh.map((n) => `• ${n.text}`).join("\n")}`
      : `${s.firstName}, напоминаю о срочном:\n${fresh.map((n) => `• ${n.text}`).join("\n")}`;
  const links = [...new Map(fresh.map((n) => [n.href, { href: n.href, label: n.label }])).values()].slice(0, 3);
  const suggestions = [...new Map(fresh.filter((n) => n.action).map((n) => [n.action!.label, n.action!])).values()].slice(0, 3);
  const title = slot === "day" ? `Главное на ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(moscowToday(now))}` : "Срочное на вечер";

  const chat = await prisma.aiChat.create({
    data: {
      userId: s.userId,
      studentId: s.id,
      title,
      messages: { create: { studentId: s.id, role: "ASSISTANT", content: text, proactive: true, links: links.length ? links : undefined, suggestions: suggestions.length ? suggestions : undefined } },
    },
    select: { id: true },
  });
  const urgent = fresh.find((n) => n.urgent);
  if (urgent) await notify([s.userId], { kind: "SYSTEM", title: "Помощник: срочное", body: urgent.text, link: "/assistant", dedupeKey: `nudge:${slot}:${day}` }).catch((e) => console.error("nudge notify", e));
  return chat.id;
}

let lastTick = 0;
/** Фоновый обход (раз в 10 минут из src/instrumentation.ts): студенты, которым помощник сегодня ещё не писал. */
export async function proactiveTick(now = new Date()) {
  if (now.getTime() - lastTick < 10 * 60_000) return 0;
  lastTick = now.getTime();
  const hhmm = moscowTime(now);
  if (hhmm < "07:00") return 0;
  const day = isoDate(moscowToday(now));
  const key = hhmm >= "18:00" ? `eve:${day}` : `day:${day}`;
  const students = await prisma.student.findMany({
    where: { user: { blockedAt: null, nudges: { none: { key } } } },
    select: { id: true, userId: true, groupId: true, subgroup: true, facultyId: true, course: true, firstName: true },
    take: 50,
  });
  let n = 0;
  for (const s of students) if (await deliverStudentDigest(s, now).catch((e) => (console.error("digest", e), null))) n++;
  return n;
}

/** Есть ли сообщение помощника «сам», которое студент ещё не открыл (точка на кнопке помощника). */
export async function unseenProactive(userId: string) {
  const m = await prisma.aiMessage.findFirst({ where: { proactive: true, chat: { userId }, createdAt: { gte: addDays(new Date(), -2) } }, orderBy: { createdAt: "desc" }, select: { chatId: true, createdAt: true, chat: { select: { seenAt: true } } } });
  return m && (!m.chat.seenAt || m.chat.seenAt < m.createdAt) ? m.chatId : null;
}
