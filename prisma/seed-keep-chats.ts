/**
 * Пересоздание демо-данных не должно стирать переписку с помощником: перед очисткой запоминаем чаты
 * (по логину владельца), после — возвращаем тем же пользователям. Карточки действий и мини-разделы,
 * ссылавшиеся на старые записи (их id после сида другие), не переносим — остаётся текст разговора.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Saved = Awaited<ReturnType<typeof snapshotChats>>;

export async function snapshotChats(prisma: PrismaClient) {
  return prisma.aiChat.findMany({
    include: { user: { select: { login: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
}

/** Виджет без ссылок на конкретные записи (дата, статус) переживает сид; с id записи — нет. */
const portableWidget = (w: Prisma.JsonValue | null) => {
  const params = (w as { params?: Record<string, string> } | null)?.params ?? {};
  return w && !Object.entries(params).some(([k, v]) => /Id$/.test(k) && v) ? (w as Prisma.InputJsonValue) : undefined;
};

export async function restoreChats(prisma: PrismaClient, saved: Saved) {
  let restored = 0;
  for (const c of saved) {
    const user = await prisma.user.findUnique({ where: { login: c.user.login }, select: { id: true, student: { select: { id: true } } } });
    if (!user) continue;
    await prisma.aiChat.create({
      data: {
        userId: user.id,
        studentId: user.student?.id ?? null,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: {
          create: c.messages.map((m) => ({
            studentId: user.student?.id ?? null,
            role: m.role,
            content: m.content,
            links: (m.links ?? undefined) as Prisma.InputJsonValue | undefined,
            widget: portableWidget(m.widget),
            suggestions: (m.suggestions ?? undefined) as Prisma.InputJsonValue | undefined,
            createdAt: m.createdAt,
          })),
        },
      },
    });
    restored++;
  }
  return restored;
}
