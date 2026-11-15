import "server-only";
/** Чаты ИИ-помощника. Как и остальные репозитории: только по студенту из сессии, чужой чат → null. */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { SessionStudent } from "./student";

export function listChats(s: SessionStudent) {
  return prisma.aiChat.findMany({
    where: { studentId: s.id },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export function getChat(s: SessionStudent, chatId: string) {
  return prisma.aiChat.findFirst({
    where: { id: chatId, studentId: s.id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
}

export function createChat(s: SessionStudent, firstMessage: string) {
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "Новый чат";
  return prisma.aiChat.create({ data: { studentId: s.id, title } });
}

export async function addMessage(s: SessionStudent, chatId: string, role: "USER" | "ASSISTANT", content: string, draft?: Prisma.InputJsonValue) {
  const [msg] = await prisma.$transaction([
    prisma.aiMessage.create({ data: { chatId, studentId: s.id, role, content, draft } }),
    prisma.aiChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
  ]);
  return msg;
}

export function recentMessages(s: SessionStudent, chatId: string, take = 10) {
  return prisma.aiMessage.findMany({ where: { chatId, studentId: s.id }, orderBy: { createdAt: "desc" }, take });
}

export async function deleteChat(s: SessionStudent, chatId: string) {
  const res = await prisma.aiChat.deleteMany({ where: { id: chatId, studentId: s.id } });
  return res.count > 0;
}

/** Черновик заявки из сообщения помощника — только своего. */
export function getDraftMessage(s: SessionStudent, messageId: string) {
  return prisma.aiMessage.findFirst({ where: { id: messageId, studentId: s.id }, select: { draft: true } });
}
