import "server-only";
/** Функции помощника, общие для всех ролей: сводка «на сегодня», напоминания себе и библиотека знаний. */
import { parseReminder } from "../../reminders";
import type { KnowledgeViewer } from "../../repos/knowledge";
import { libraryAnswer, libraryBase } from "../library";
import { norm } from "../common";
import type { Tool } from "../router";

export function sharedTools<C extends { viewer: KnowledgeViewer }>(role: "student" | "teacher" | "staff"): Tool<C>[] {
  return [
    {
      name: "today",
      title: "Сводка на сегодня",
      keywords: [["что сегодня", 4], ["что у меня сегодня", 5], ["сводк", 4], ["план на день", 4], ["главное", 2], ["что важного", 4], ["с чего начать", 4]],
      examples: ["Что у меня сегодня?", "Сводка на день", "Что важного?"],
      not: ["распис", "пары"],
      run: () => ({ text: "Главное на сегодня:", widget: { type: `${role}.today`, params: {} } }),
    },
    {
      name: "remind",
      title: "Напоминание",
      keywords: [["напомни мне", 6], ["поставь напоминание", 6], ["создай напоминание", 6], ["не забыть", 3], ["напоминание", 2], ...(role === "student" ? ([["напомни", 4]] as [string, number][]) : [])],
      examples: ["Напомни мне завтра в 9 про лабораторную", "Поставь напоминание на пятницу"],
      not: ["мои напоминания", "какие напоминания", "список напоминаний"],
      run: (message) => {
        const r = parseReminder(message);
        return {
          text: r.dueAt ? "Поставлю напоминание — проверьте текст и время." : "Когда напомнить? Укажите время в карточке.",
          draft: { kind: "REMINDER", text: r.text, dueAt: r.dueAt },
        };
      },
    },
    {
      name: "reminders",
      title: "Мои напоминания",
      keywords: [["мои напоминания", 6], ["какие напоминания", 6], ["список напоминаний", 6]],
      examples: ["Мои напоминания"],
      run: () => ({ text: "Ваши напоминания (удалить — крестик):", widget: { type: "any.reminders", params: {} } }),
    },
    {
      name: "library",
      title: "Библиотека: правила и инструкции",
      keywords: [["библиотек", 5], ["положени", 3], ["правила", 2.5], ["требовани", 2.5], ["методичк", 3], ["инструкци", 3], ["регламент", 3], ["что говорит", 2], ["где написано", 3], ["часы работы", 2.5], ["когда работает", 2.5], ["оформлени", 1.5], ["курсов", 1.5], ["что будет", 2.5], ["можно ли", 1.5], ["опозда", 2], ["позже срока", 2]],
      examples: ["Что говорит положение о пересдачах?", "Требования к курсовой работе", "Когда работает деканат?", "Что есть в библиотеке?"],
      not: ["напомни"],
      run: async (message, ctx) => {
        const m = norm(message);
        const base = libraryBase(ctx.viewer.role);
        if (/что есть в библиотек|какие материалы|покажи библиотек|открой библиотек|список материалов/.test(m))
          return { text: "Материалы библиотеки:", widget: { type: "any.library", params: {} } };
        const r = await libraryAnswer(ctx.viewer, message);
        if (r) return { text: r.text, links: r.links };
        return {
          text:
            role === "student"
              ? "В библиотеке ответа на это не нашёл. Можно написать в деканат — ответят в течение рабочего дня."
              : "В библиотеке ответа не нашёл. Если вопрос частый — добавьте материал, и помощник будет отвечать студентам.",
          links: role === "student" ? [{ href: "/messages/new", label: "Написать в деканат" }, { href: base, label: "Открыть библиотеку" }] : [{ href: base, label: "Открыть библиотеку" }],
        };
      },
    },
  ];
}
