import { requireStudent } from "@/server/auth";
import { prisma } from "@/server/db";
import { Chat } from "./chat";

export const metadata = { title: "ИИ-помощник" };

const typeTitles: Record<string, string> = {
  CERT_STUDY: "Справка об обучении",
  CERT_MILITARY: "Справка для военкомата",
  CERT_SCHOLARSHIP: "Справка о стипендии",
  APP_RETAKE: "Заявление на пересдачу",
  APP_ABSENCE: "Уважительная причина пропуска",
  APP_ACADEMIC_LEAVE: "Академический отпуск",
  APP_OTHER: "Обращение в деканат",
};

export default async function AssistantPage() {
  const { student } = await requireStudent();
  const msgs = await prisma.aiMessage.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "asc" }, take: 50 });
  return (
    <Chat
      firstName={student.firstName}
      typeTitles={typeTitles}
      initial={msgs.map((m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", text: m.content, draft: (m.draft as { typeCode: string } | null) ?? null }))}
    />
  );
}
