/** Статусы домашнего задания для студента — подписи и цвета в одном месте. */
export type HwState = "todo" | "overdue" | "submitted" | "returned" | "accepted";

export const hwState: Record<HwState, { label: string; cls: string; hint: string }> = {
  todo: { label: "Нужно сдать", cls: "bg-p-lilac text-[#0e0e10]", hint: "Прикрепите файлы и отправьте до срока" },
  overdue: { label: "Срок прошёл", cls: "bg-danger-soft text-danger", hint: "Сдать ещё можно — преподаватель увидит, что позже срока" },
  submitted: { label: "На проверке", cls: "bg-p-yellow text-[#0e0e10]", hint: "Преподаватель проверит и ответит — придёт уведомление" },
  returned: { label: "На доработке", cls: "bg-warning-soft text-warning", hint: "Исправьте по комментарию и отправьте снова" },
  accepted: { label: "Принято", cls: "bg-success-soft text-success", hint: "Задание зачтено" },
};

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1048576).toFixed(1).replace(".", ",")} МБ`);
