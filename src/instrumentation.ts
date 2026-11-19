/**
 * Запуск сервера: фоновая доставка напоминаний раз в минуту (уведомление + push).
 * Только в Node-рантайме; в dev при перезагрузке модулей таймер не дублируется (флаг на globalThis).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __reminderTimer?: ReturnType<typeof setInterval> };
  if (g.__reminderTimer) return;
  const { deliverDueReminders } = await import("./server/reminders");
  g.__reminderTimer = setInterval(() => {
    deliverDueReminders().catch((e) => console.error("reminders", e));
  }, 60_000);
}
