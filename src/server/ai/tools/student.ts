import "server-only";
/**
 * Инструменты помощника студента. Каждый: когда подходит (ключевые слова, примеры), что отвечает,
 * какой мини-раздел показывает в чате и какие следующие шаги предлагает.
 */
import type { StudentContext } from "../context";
import { fmtDateTime, fmtDay, moscowToday } from "@/lib/utils";
import { prisma } from "../../db";
import { studentNudges } from "../../proactive";
import { situationFromText } from "@/config/situations";
import { deanery, docKinds } from "@/config/services";
import { availability } from "../../services/appointments";
import { isUsable, listMyDocuments } from "../../services/documents";

const timeFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
import { forecastLabel, isBelow } from "@/lib/grading";
import { bestMentions, norm, parseDay } from "../common";
import { examplesOf, type Tool, type ToolResult } from "../router";
import { sharedTools } from "./shared";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Задание из фразы: «лаба 5», «лабораторную №5», название дисциплины; иначе — то, что нужно сдать в первую очередь. */
export function pickHomework(message: string, ctx: StudentContext) {
  const m = norm(message);
  const open = ctx.openHomework;
  const num = m.match(/(?:лаб[а-я]*|работ[а-я]*|задани[а-я]*|дз|№)\s*(?:работ[а-я]*\s*)?№?\s*(\d+)/)?.[1];
  if (num) {
    const re = new RegExp(`№\\s*${num}(?!\\d)`);
    const hit = open.find((h) => re.test(h.title));
    if (hit) return hit;
  }
  const byCourse = bestMentions(m, open, (h) => `${h.course.name} ${h.title}`)[0];
  return byCourse ?? open.find((h) => h.state === "returned") ?? open.find((h) => h.state === "todo" || h.state === "overdue") ?? open[0];
}

export const studentTools: Tool<StudentContext>[] = [
  ...sharedTools<StudentContext>("student"),
  {
    name: "schedule",
    title: "Расписание",
    keywords: [["распис", 3], ["пары", 2], ["пара ", 2], ["какие пары", 2], ["аудитор", 2], ["завтра", 1], ["сегодня", 1], ["послезавтра", 1], ["где пара", 2], ["во сколько", 1.5]],
    examples: ["Какие пары завтра?", "Расписание на сегодня", "Где у меня пара?", "Какие пары в пятницу"],
    not: ["перенес"],
    run: (msg, ctx) => {
      const day = parseDay(msg) ?? moscowToday();
      const pool = ctx.lessons.filter((l) => l.date.getTime() === day.getTime());
      const active = pool.filter((l) => l.status !== "CANCELLED");
      const changed = pool.filter((l) => l.status !== "SCHEDULED");
      return {
        // дата — в заголовке мини-раздела, в тексте только главное
        text: active.length
          ? `${active.length} ${active.length === 1 ? "пара" : active.length < 5 ? "пары" : "пар"}, первая — в ${active[0].startTime}.${changed.length ? " Есть изменения, они отмечены." : ""}`
          : changed.length
            ? "Пар нет: занятия этого дня отменены."
            : "В этот день пар нет.",
        widget: { type: "student.schedule", params: { date: iso(day) } },
        suggestions: examplesOf(studentTools, ["homework", "grades"]),
      };
    },
  },
  {
    name: "homework",
    title: "Что сдать",
    keywords: [["что сдать", 4], ["что мне сдать", 4], ["домашк", 3], ["домашн", 3], ["задани", 2], ["дз", 1.5], ["дедлайн", 2], ["срок", 1]],
    examples: ["Что мне сдать?", "Какие домашние задания?", "Какие у меня дедлайны"],
    not: ["сдай", "загрузи", "прикрепи", "что будет", "что если", "позже срока", "опозда"],
    run: (_msg, ctx) => {
      const open = ctx.openHomework;
      const urgent = open.filter((h) => h.state === "overdue" || h.state === "returned").length;
      const todo = open.filter((h) => h.state === "todo").length;
      const waiting = open.filter((h) => h.state === "submitted").length;
      const parts = [urgent && `срочно ${urgent}`, todo && `сдать ${todo}`, waiting && `на проверке ${waiting}`].filter(Boolean);
      return {
        text: open.length ? `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}. Сдать можно прямо здесь.` : "Все домашние задания сданы и приняты.",
        widget: { type: "student.homework", params: {} },
        links: ctx.deadlines.length ? undefined : [{ href: "/homework", label: "Все задания" }],
      };
    },
  },
  {
    name: "submit",
    title: "Сдать задание",
    keywords: [["сдай", 4], ["сдать лаб", 4], ["сдать дз", 4], ["сдать работ", 3], ["загрузи", 3], ["прикрепи", 3], ["отправь лаб", 4], ["отправь дз", 4], ["отправить работ", 3]],
    examples: ["Сдай лабораторную №5", "Отправь мою работу по базам данных", "Прикрепи отчёт к заданию"],
    // вопрос о правилах сдачи («что будет, если сдать позже») — не команда сдать; ответит библиотека
    not: ["что будет", "что если", "можно ли", "позже срока", "опозда", "сколько баллов"],
    run: (msg, ctx) => {
      const h = pickHomework(msg, ctx);
      if (!h) return { text: "Несданных заданий сейчас нет — всё принято." };
      return {
        text: `Готов отправить «${h.title}» (${h.course.name})${h.state === "returned" ? " — работа была на доработке" : ""}. Прикрепите файлы и нажмите «Отправить преподавателю».`,
        draft: { kind: "SUBMISSION", assignmentId: h.id },
      };
    },
  },
  {
    name: "grades",
    title: "Оценки и прогноз",
    keywords: [["оценк", 3], ["балл", 3], ["прогноз", 3], ["успеваем", 3], ["как у меня дела", 2.5], ["подтянуть", 2], ["сесси", 1.5], ["зачет", 1], ["экзамен", 1]],
    examples: ["Как у меня дела по оценкам?", "Какой прогноз по базам данных", "Что подтянуть до сессии"],
    run: (msg, ctx) => {
      const pick = bestMentions(norm(msg), ctx.scores, (x) => x.course);
      const list = pick.length ? pick : ctx.scores;
      if (!list.length) return { text: "В этом семестре оценок пока нет." };
      const weak = ctx.scores.filter((x) => x.score && isBelow(x.score.forecast));
      const text = pick.length
        ? pick.map((x) => `${x.course}: ${x.score ? `${x.score.points} из ${x.score.max} — прогноз ${forecastLabel(x.score.forecast)}` : "оценок пока нет"}`).join("\n")
        : weak.length
          ? `Стоит подтянуть: ${weak.map((x) => x.course).join(", ")} — пока ниже порога 60 %. Подробно — ниже.`
          : "По всем дисциплинам вы выше порога. Подробно — ниже.";
      return {
        text: text + (ctx.debts.length ? `\nДолги прошлых семестров: ${ctx.debts.map((d) => d.course).join(", ")}.` : ""),
        widget: pick.length ? undefined : { type: "student.grades", params: {} },
        suggestions: ctx.debts.length ? [{ label: "Подать на пересдачу", message: "Как пересдать долг?", tool: "retake" }] : undefined,
      };
    },
  },
  {
    name: "attendance",
    title: "Мои пропуски",
    keywords: [["посещаем", 4], ["пропусков", 3], ["сколько я пропус", 4], ["сколько пропус", 4], ["много пропус", 3], ["пропустил", 1]],
    examples: ["Сколько я пропустил?", "Моя посещаемость", "Много ли у меня пропусков"],
    not: ["болел", "больнич", "уважител", "заявлен", "справк"],
    run: (_msg, ctx) => {
      const a = ctx.attendance;
      if (!a.total) return { text: "Отметок посещаемости пока нет." };
      const low = ctx.attendanceByCourse.filter((c) => c.total >= 3 && c.present / c.total < 0.8);
      return {
        text: `Посещаемость — ${a.percent} %, пропущено ${a.total - a.present} из ${a.total}.` + (low.length ? ` Ниже 80 %: ${low.map((c) => c.name).join(", ")}.` : " По всем дисциплинам 80 % и выше."),
        widget: { type: "student.attendance", params: {} },
        suggestions: a.total - a.present ? [{ label: "Заявление об уважительной причине", message: "Я пропустил по уважительной причине", tool: "absence" }] : undefined,
      };
    },
  },
  {
    name: "requests",
    title: "Мои заявки",
    keywords: [["мои заявк", 4], ["статус", 3], ["где моя", 3], ["готова ли", 3], ["готова справк", 3], ["заявки", 1.5]],
    examples: ["Какой статус моих заявок?", "Где моя справка?", "Готова ли справка"],
    run: () => ({ text: "Ваши заявки и их статусы:", widget: { type: "student.requests", params: {} } }),
  },
  {
    name: "certificate",
    title: "Заказать справку",
    keywords: [["справк", 4], ["нужна справка", 2], ["закажи", 2], ["военкомат", 2], ["стипенд", 1]],
    examples: ["Нужна справка в банк", "Справка для военкомата", "Справка о стипендии"],
    not: ["статус", "где моя", "готова ли", "готова справк"],
    run: (msg) => {
      const m = norm(msg);
      const has = (...w: string[]) => w.some((x) => m.includes(x));
      if (has("военк", "армия", "отсрочк"))
        return { text: "Подготовил справку для военкомата. Военкоматы обычно принимают бумажный оригинал — копия с печатью уже отмечена. Укажите район и нажмите «Заказать».", draft: { typeCode: "CERT_MILITARY", payload: { commissariat: "" } } };
      if (has("стипенд")) return { text: "Справка о стипендии готова к заказу — проверьте период и нажмите «Заказать».", draft: { typeCode: "CERT_SCHOLARSHIP", payload: { period: "6 месяцев" } } };
      const place = has("банк") ? "В банк" : has("работ") ? "По месту работы" : has("соцзащит", "субсид") ? "В соцзащиту" : "";
      return { text: "Справка об обучении готова к заказу — проверьте, куда она нужна, и нажмите «Заказать». Электронная версия с QR-кодом будет готова сразу.", draft: { typeCode: "CERT_STUDY", payload: { place, copies: "1" } } };
    },
  },
  {
    name: "retake",
    title: "Пересдача",
    keywords: [["пересда", 4], ["долг", 3], ["задолж", 3]],
    examples: ["Как пересдать долг?", "Есть ли у меня долги", "Заявление на пересдачу"],
    run: (_msg, ctx) => {
      if (ctx.retakes.length) {
        const r = ctx.retakes[0];
        return { text: `Пересдача по «${r.course.name}» уже назначена: ${fmtDay(r.date)}, ауд. ${r.room}.` };
      }
      if (ctx.debts.length)
        return { text: `Долги: ${ctx.debts.map((d) => d.course).join(", ")}. Подготовил заявление на пересдачу — проверьте и отправьте.`, draft: { typeCode: "APP_RETAKE", payload: { course: ctx.debts[0].course, reason: "" } } };
      return { text: "Долгов у вас нет — пересдача не нужна." };
    },
  },
  {
    name: "absence",
    title: "Заявление о пропуске",
    keywords: [["болел", 4], ["больнич", 4], ["уважител", 4], ["заявление о пропуск", 4], ["пропустил по", 3], ["пропуск по", 3]],
    examples: ["Я болел три дня", "Пропустил по уважительной причине", "Заявление о пропуске"],
    run: (msg) => {
      const sick = /болел|больнич/.test(norm(msg));
      return { text: "Подготовил заявление об уважительной причине пропуска. Укажите даты и причину; оригинал справки принесите в деканат (каб. 204) в течение 10 дней.", draft: { typeCode: "APP_ABSENCE", payload: { dateFrom: "", dateTo: "", reason: sick ? "Болезнь" : "" } } };
    },
  },
  {
    name: "academic",
    title: "Академический отпуск",
    keywords: [["академ", 4]],
    examples: ["Как взять академический отпуск"],
    run: () => ({ text: "Академический отпуск можно взять до 2 лет. Подготовил черновик заявления — выберите основание и дату.", draft: { typeCode: "APP_ACADEMIC_LEAVE", payload: { basis: "Медицинские показания", dateFrom: "" } } }),
  },
  {
    name: "situation",
    title: "Жизненная ситуация",
    keywords: [["заболел", 5], ["болею", 5], ["в больнице", 4], ["армию", 5], ["призыв", 4], ["повестк", 4], ["перевестись", 5], ["перевод на", 3], ["заселиться", 5], ["заселение", 4], ["общежити", 3], ["материальн", 5], ["нужны деньги", 5], ["первокурсник", 5], ["с чего начать", 2]],
    examples: ["Я заболел, что делать?", "Ухожу в армию", "Хочу заселиться в общежитие", "Нужна материальная помощь", "Я первокурсник"],
    not: ["справк", "статус"],
    run: (msg) => {
      const s = situationFromText(msg);
      if (!s) return { text: "Расскажите, что случилось, — подскажу, что оформить.", links: [{ href: "/requests", label: "Все ситуации" }] };
      return { text: `${s.intro} Вот план — откройте, и я буду отмечать шаги по мере выполнения:`, widget: { type: "student.situation", params: { code: s.code } } };
    },
  },
  {
    name: "appointment",
    title: "Запись на приём",
    keywords: [["записаться", 5], ["запиши", 4], ["на приём", 5], ["на прием", 5], ["прийти в", 2], ["очеред", 3], ["забрать оригинал", 4], ["забрать справк", 4]],
    examples: ["Запиши меня в деканат", "Хочу записаться на приём", "Когда можно забрать справку"],
    not: ["напомни"],
    run: async () => {
      const days = await availability(5);
      const free = days.flatMap((d) => d.slots.filter((s) => s.free))[0];
      return {
        text: free ? `Деканат, ${deanery.room}. Ближайшее свободное время — ${timeFmt.format(free.at)}. Выберите удобный слот — придёте без очереди, за час напомню.` : "В ближайшие дни свободного времени в деканате нет — загляните позже.",
        links: [{ href: "/services/appointments", label: "Записаться в деканат" }],
      };
    },
  },
  {
    name: "documents",
    title: "Мои документы",
    keywords: [["мои документы", 6], ["документы", 2], ["паспорт", 3], ["снилс", 3], ["флюорограф", 4], ["реквизит", 3], ["загрузить документ", 5]],
    examples: ["Мои документы", "Где загрузить паспорт?", "Когда истекает флюорография"],
    not: ["справк"],
    run: async (_msg, ctx) => {
      const docs = await listMyDocuments(ctx.student);
      const latest = new Map<string, (typeof docs)[number]>();
      for (const d of docs) if (!latest.has(d.kind)) latest.set(d.kind, d);
      const list = [...latest.values()];
      if (!list.length) return { text: "Документов пока нет. Загрузите паспорт, СНИЛС и реквизиты один раз — дальше они будут подставляться в заявки сами.", links: [{ href: "/services/documents", label: "Загрузить документы" }] };
      const lines = list.map((d) => `${docKinds[d.kind].title} — ${d.status === "REJECTED" ? `не принят: ${d.reviewNote}` : !isUsable(d) ? "истёк" : d.status === "VERIFIED" ? "проверен" : "на проверке"}${d.validUntil && isUsable(d) ? `, до ${fmtDay(d.validUntil)}` : ""}`);
      return { text: lines.join("\n"), links: [{ href: "/services/documents", label: "Мои документы" }] };
    },
  },
  {
    name: "advice",
    title: "Что мне сделать",
    keywords: [["что мне сделать", 5], ["что сделать", 4], ["что срочно", 5], ["что горит", 5], ["на что обратить", 5], ["что я упустил", 5], ["что упустил", 4], ["посоветуй", 3], ["совет", 2], ["что делать", 3]],
    examples: ["Что мне сейчас сделать?", "Что горит?", "На что обратить внимание?"],
    run: async (_msg, ctx) => {
      const items = await studentNudges(ctx.student, ctx);
      const urgent = items.filter((n) => n.urgent).length;
      return {
        text: items.length ? (urgent ? `Срочного — ${urgent}. Начните с него:` : "Срочного нет, но вот что стоит сделать:") : "Всё спокойно: сроки, пропуски и заявки в порядке.",
        widget: items.length ? { type: "student.nudges", params: {} } : undefined,
      };
    },
  },
  {
    name: "exams",
    title: "Сессия и экзамены",
    keywords: [["экзамен", 3], ["сесси", 2.5], ["зачет", 2.5], ["когда пересдач", 3], ["расписание сессии", 5], ["когда сдавать", 3]],
    examples: ["Когда экзамены?", "Расписание сессии", "Когда зачёт по базам данных?"],
    not: ["подтянуть", "прогноз", "балл"],
    run: (msg, ctx) => {
      const now = new Date();
      const upcoming = ctx.exams.filter((e) => e.date > now);
      const pick = bestMentions(norm(msg), upcoming, (e) => e.course.name);
      if (pick.length) return { text: pick.map((e) => `${e.course.name}: ${fmtDateTime(e.date)}, ауд. ${e.room}.`).join("\n"), widget: { type: "student.exams", params: {} } };
      return { text: upcoming.length ? `Впереди: ${upcoming.length}. Ближайшее — «${upcoming[0].course.name}», ${fmtDay(upcoming[0].date)}.` : "Ближайших экзаменов и зачётов нет.", widget: upcoming.length ? { type: "student.exams", params: {} } : undefined, suggestions: upcoming.length ? [{ label: "Что подтянуть", message: "Что подтянуть до сессии", tool: "grades" }] : undefined };
    },
  },
  {
    name: "materials",
    title: "Материалы преподавателей",
    keywords: [["материал", 3], ["методичк", 2.5], ["конспект", 2.5], ["презентац", 2.5], ["лекци", 1.5], ["файлы", 1.5], ["скачать", 1.5]],
    examples: ["Где материалы по базам данных?", "Новые материалы", "Где презентации лекций?"],
    not: ["библиотек", "положени"],
    run: (msg, ctx) => {
      const [c] = bestMentions(norm(msg), ctx.scores, (x) => x.course);
      return { text: c ? `Материалы по «${c.course}»:` : "Новые материалы преподавателей:", widget: { type: "student.materials", params: (c ? { courseId: c.courseId } : {}) as Record<string, string> } };
    },
  },
  {
    name: "teachers",
    title: "Мои преподаватели",
    keywords: [["преподавател", 3], ["кто ведет", 5], ["кто читает", 5], ["препод", 2], ["кафедр", 2]],
    examples: ["Кто ведёт базы данных?", "Мои преподаватели"],
    not: ["напиши", "написать", "сообщени"],
    run: async (msg, ctx) => {
      const rows = await prisma.lesson.findMany({ where: { groupId: ctx.student.groupId }, distinct: ["teacherId", "courseId"], select: { course: { select: { name: true } }, teacher: { select: { fullName: true, department: true } } } });
      const pick = bestMentions(norm(msg), rows, (r) => r.course.name);
      const list = (pick.length ? pick : rows).sort((a, b) => a.course.name.localeCompare(b.course.name, "ru"));
      if (!list.length) return { text: "В расписании пока нет преподавателей." };
      return {
        text: list.map((r) => `${r.course.name} — ${r.teacher.fullName} (${r.teacher.department})`).join("\n"),
        links: [{ href: "/messages/new", label: "Написать преподавателю" }],
      };
    },
  },
  {
    name: "wellbeing",
    title: "Поддержка",
    keywords: [["психолог", 4], ["тревож", 3], ["стресс", 3], ["устал", 2], ["выгора", 3], ["тяжело", 2]],
    examples: ["Мне тяжело, где психолог"],
    run: () => ({ text: "Сочувствую — сессия бывает тяжёлой. В студенческом центре (каб. 115) работает психолог: бесплатно и анонимно. Если нужна отсрочка по учёбе — помогу с заявлением в деканат." }),
  },
];

export function studentHelp(ctx: StudentContext): ToolResult {
  return {
    text: `${ctx.firstName}, я помогаю с учёбой и делами в деканате: расписание и сессия, задания и их сдача, оценки и прогноз, пропуски, справки и заявления, материалы, а ещё отвечаю по правилам вуза из библиотеки. Выберите или напишите своими словами.`,
    suggestions: examplesOf(studentTools, ["advice", "situation", "homework", "grades", "appointment", "certificate"]),
  };
}

