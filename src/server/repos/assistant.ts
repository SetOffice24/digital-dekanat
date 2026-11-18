import "server-only";
/**
 * Чаты помощника — у всех ролей. Как и остальные репозитории: только свои чаты (по пользователю из сессии),
 * чужой чат → null. Студент передаётся с userId, преподаватель и деканат — так же, по userId.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

export type ChatOwner = { userId: string; studentId?: string | null };

export function listChats(o: ChatOwner) {
  return prisma.aiChat.findMany({
    where: { userId: o.userId },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export function getChat(o: ChatOwner, chatId: string) {
  return prisma.aiChat.findFirst({
    where: { id: chatId, userId: o.userId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
}

export function createChat(o: ChatOwner, firstMessage: string) {
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "Новый чат";
  return prisma.aiChat.create({ data: { userId: o.userId, studentId: o.studentId ?? null, title } });
}

export async function addMessage(o: ChatOwner, chatId: string, role: "USER" | "ASSISTANT", content: string, draft?: Prisma.InputJsonValue, links?: Prisma.InputJsonValue) {
  const chat = await prisma.aiChat.findFirst({ where: { id: chatId, userId: o.userId }, select: { id: true } });
  if (!chat) throw new Error("chat not found");
  const [msg] = await prisma.$transaction([
    prisma.aiMessage.create({ data: { chatId, studentId: o.studentId ?? null, role, content, draft, links } }),
    prisma.aiChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
  ]);
  return msg;
}

export function recentMessages(o: ChatOwner, chatId: string, take = 10) {
  return prisma.aiMessage.findMany({ where: { chatId, chat: { userId: o.userId } }, orderBy: { createdAt: "desc" }, take });
}

export async function deleteChat(o: ChatOwner, chatId: string) {
  const res = await prisma.aiChat.deleteMany({ where: { id: chatId, userId: o.userId } });
  return res.count > 0;
}

/** Черновик из сообщения помощника — только своего. */
export function getDraftMessage(o: ChatOwner, messageId: string) {
  return prisma.aiMessage.findFirst({ where: { id: messageId, chat: { userId: o.userId } }, select: { draft: true } });
}

/** Отметить, что по черновику уже выполнено действие (заявка, задание, объявление), чтобы карточка не повторяла его. */
export async function markDraftDone(o: ChatOwner, messageId: string, done: Record<string, string>) {
  const m = await prisma.aiMessage.findFirst({ where: { id: messageId, chat: { userId: o.userId } }, select: { draft: true } });
  if (!m?.draft) return false;
  await prisma.aiMessage.update({ where: { id: messageId }, data: { draft: { ...(m.draft as object), ...done } } });
  return true;
}

/** Студенческая заявка по черновику (историческое имя). */
export const markDraftOrdered = (o: ChatOwner, messageId: string, requestId: string) => markDraftDone(o, messageId, { requestId });
