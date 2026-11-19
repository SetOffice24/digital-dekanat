import "server-only";
/** Функции помощника, общие для всех ролей: сводка «на сегодня» и напоминания себе. */
import { parseReminder } from "../../reminders";
import type { Tool } from "../router";

export function sharedTools<C>(role: "student" | "teacher" | "staff"): Tool<C>[] {
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
  ];
}
