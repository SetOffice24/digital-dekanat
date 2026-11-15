import { requireStudent } from "@/server/auth";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export const metadata = { title: "Помощник" };

/** Полноэкранная версия помощника (та же панель, что открывается поверх разделов). */
export default async function AssistantPage() {
  const { student } = await requireStudent();
  return (
    <div className="-mx-4 -mt-3 h-[calc(100dvh-8.5rem)] overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[28px] sm:shadow-[0_8px_30px_-12px_rgba(20,24,40,0.2)] sm:ring-1 sm:ring-border lg:h-[calc(100dvh-6rem)]">
      <AssistantPanel firstName={student.firstName} mode="page" />
    </div>
  );
}
