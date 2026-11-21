/**
 * Распознавание намерения: живые фразы → нужная функция помощника (без модели, только правила).
 * Если фраза не узнана или узнана неверно — это регрессия качества помощника.
 */
import { describe, expect, it } from "vitest";
import { rank, route, type Tool } from "@/server/ai/router";
import { studentTools } from "@/server/ai/tools/student";
import { teacherTools } from "@/server/ai/teacher";
import { staffTools } from "@/server/ai/staff";

const top = <C,>(tools: Tool<C>[], phrase: string) => rank(phrase, tools)[0];

function expectRoutes<C>(tools: Tool<C>[], cases: [string, string][]) {
  const wrong = cases.filter(([phrase, tool]) => {
    const [t, second] = rank(phrase, tools);
    // ещё и без лишнего переспрашивания: второй кандидат заметно слабее
    const ambiguous = second && second.score >= 2.5 && second.score >= t.score * 0.85;
    return !t || t.tool.name !== tool || t.score < 2.5 || ambiguous;
  });
  expect(wrong.map(([p, t]) => `${p} → ожидалось ${t}, получилось ${top(tools, p)?.tool.name} (${top(tools, p)?.score.toFixed(1)})`)).toEqual([]);
}

describe("распознавание: студент", () => {
  it("живые фразы попадают в нужную функцию", () =>
    expectRoutes(studentTools, [
      ["какие пары завтра", "schedule"],
      ["что мне сейчас сделать?", "advice"],
      ["что горит?", "advice"],
      ["когда экзамены", "exams"],
      ["расписание сессии", "exams"],
      ["где материалы по базам данных", "materials"],
      ["кто ведёт базы данных", "teachers"],
      ["что говорит положение о пересдачах", "library"],
      ["требования к лабораторным работам", "library"],
      ["что есть в библиотеке", "library"],
      ["что подтянуть до сессии", "grades"],
      ["я заболел, что делать?", "situation"],
      ["ухожу в армию", "situation"],
      ["хочу заселиться в общежитие", "situation"],
      ["нужна материальная помощь", "situation"],
      ["я первокурсник", "situation"],
      ["запиши меня на приём в деканат", "appointment"],
      ["хочу записаться на приём", "appointment"],
      ["мои документы", "documents"],
      ["когда истекает флюорография", "documents"],
      ["что будет, если сдать лабу позже срока", "library"],
      ["расписание на пятницу", "schedule"],
      ["во сколько у меня завтра первая пара", "schedule"],
      ["что мне сдать?", "homework"],
      ["какие домашки висят", "homework"],
      ["сдай лабу 5", "submit"],
      ["прикрепи отчёт к лабораторной №5", "submit"],
      ["мои оценки", "grades"],
      ["какой прогноз по базам данных", "grades"],
      ["сколько я пропустил", "attendance"],
      ["моя посещаемость", "attendance"],
      ["где моя справка", "requests"],
      ["какой статус моих заявок", "requests"],
      ["нужна справка в банк", "certificate"],
      ["справку для военкомата", "certificate"],
      ["я болел два дня", "absence"],
      ["есть ли у меня долги", "retake"],
      ["хочу взять академ", "academic"],
      ["что у меня сегодня", "today"],
      ["напомни завтра в 9 про лабораторную", "remind"],
      ["мои напоминания", "reminders"],
    ]));
});

describe("распознавание: преподаватель", () => {
  it("живые фразы попадают в нужную функцию", () =>
    expectRoutes(teacherTools, [
      ["какие у меня пары завтра", "schedule"],
      ["расписание на сегодня", "schedule"],
      ["отметь посещаемость", "mark"],
      ["на паре не было Зорина", "mark"],
      ["перекличка", "mark"],
      ["что ждёт проверки", "reviews"],
      ["кто не сдал лабу 5", "missing"],
      ["задай ИВТ-24-1 лабораторную №6 до пятницы", "assign"],
      ["напиши Зорину, что отчёт нужно доделать", "message"],
      ["напомни ИВТ-24-1 про лабораторную №5", "message"],
      ["у кого низкая посещаемость", "lowattendance"],
      ["напомни мне в пятницу проверить лабораторные", "remind"],
      ["сводка на день", "today"],
    ]));
});

describe("распознавание: деканат", () => {
  it("живые фразы попадают в нужную функцию", () =>
    expectRoutes(staffTools, [
      ["сколько новых заявок", "inbox"],
      ["покажи входящие", "inbox"],
      ["найди заявку Озёрова", "findrequest"],
      ["заявка № 587", "findrequest"],
      ["пары ИВТ-24-1 завтра", "groupday"],
      ["отмени пару ИВТ-24-1", "groupday"],
      ["перенеси пару ИВТ-24-1 на пятницу 12:20", "move"],
      ["объяви ИВТ-24-1: лекция переносится", "announce"],
      ["сколько фото ждут проверки", "photos"],
      ["кто из ИВТ-24-1 не входил", "accounts"],
      ["найди студента Леснова", "student"],
      ["что важного сегодня", "today"],
      ["поставь напоминание на понедельник про отчёт", "remind"],
    ]));
});

describe("напоминания: разбор времени и текста", () => {
  it("«завтра в 9», «через 30 минут», «в пятницу» — срок; текст — о чём", async () => {
    const { parseReminder } = await import("@/server/reminders");
    const a = parseReminder("напомни мне завтра в 9 про лабораторную №5");
    expect(a.text).toBe("Лабораторную №5");
    expect(a.dueAt.endsWith("T09:00")).toBe(true);
    const b = parseReminder("напомни через 30 минут позвонить в деканат");
    const mins = (new Date(b.dueAt + ":00+03:00").getTime() - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(28);
    expect(mins).toBeLessThan(32);
    expect(parseReminder("поставь напоминание на пятницу про отчёт").dueAt.endsWith("T09:00")).toBe(true);
    expect(parseReminder("напомни про отчёт").dueAt).toBe("");
  });
});

describe("уточнение и выбор кнопкой", () => {
  const tools: Tool<null>[] = [
    { name: "a", title: "Расписание", keywords: [["пары", 3]], examples: ["пары"], run: () => ({ text: "A" }) },
    { name: "b", title: "Посещаемость", keywords: [["пары", 3]], examples: ["пары"], run: () => ({ text: "B" }) },
  ];
  const help = () => ({ text: "help" });

  it("два равных кандидата — вопрос с кнопками, а не угадывание", async () => {
    const r = await route("пары", tools, null, { help });
    expect(r.via).toBe("clarify");
    expect(r.suggestions?.map((s) => s.tool)).toEqual(["a", "b"]);
  });

  it("кнопка выбирает функцию явно; непонятное — справка", async () => {
    expect((await route("пары", tools, null, { help, forced: "b" })).text).toBe("B");
    expect((await route("погода в Москве", tools, null, { help })).via).toBe("help");
  });
});
