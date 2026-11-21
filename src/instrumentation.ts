/**
 * Запуск сервера: фоновые задачи раз в минуту — доставка напоминаний (уведомление + push)
 * обход студентов для сообщений помощника «сам» (внутри не чаще раза в 10 минут)
 * и передача просроченных заявок руководителю.
 * Только в Node-рантайме; в dev при перезагрузке модулей таймер не дублируется (флаг на globalThis).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __reminderTimer?: ReturnType<typeof setInterval> };
  if (g.__reminderTimer) return;
  const { deliverDueReminders } = await import("./server/reminders");
  const { proactiveTick } = await import("./server/proactive");
  const { escalateOverdue } = await import("./server/services/requests");
  g.__reminderTimer = setInterval(() => {
    deliverDueReminders().catch((e) => console.error("reminders", e));
    proactiveTick().catch((e) => console.error("proactive", e));
    escalateOverdue().catch((e) => console.error("escalate", e));
  }, 60_000);
}
