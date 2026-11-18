/**
 * Демо-переписка: студент ↔ преподаватель, обращения в деканат (новое, решённое), преподаватель → деканат, деканат → студент.
 * Вызывается из seed.ts после пользователей, заявок и домашних заданий.
 */
import type { PrismaClient } from "@prisma/client";

type Ctx = { prisma: PrismaClient; now: Date; annaUserId: string; petrUserId: string; teacherUserId: string; staffUserId: string; annaFacultyId: string; petrFacultyId: string; annaGroupId: string };

export async function seedMessages(c: Ctx) {
  const { prisma } = c;
  const ago = (h: number) => new Date(c.now.getTime() - h * 3600_000);

  type Msg = { from: string; body: string; h: number };
  const conv = async (data: { kind: "DIRECT" | "DEANERY"; subject: string; facultyId?: string | null; startedById: string; status?: "OPEN" | "RESOLVED"; context?: { type: string; id: string; label: string }; participants: { userId: string; readH?: number | null }[]; messages: Msg[] }) => {
    const last = data.messages[data.messages.length - 1];
    await prisma.conversation.create({
      data: {
        kind: data.kind,
        subject: data.subject,
        facultyId: data.facultyId ?? null,
        startedById: data.startedById,
        status: data.status ?? "OPEN",
        resolvedAt: data.status === "RESOLVED" ? ago(last.h - 0.1) : null,
        contextType: data.context?.type ?? null,
        contextId: data.context?.id ?? null,
        contextLabel: data.context?.label ?? null,
        createdAt: ago(data.messages[0].h),
        lastMessageAt: ago(last.h),
        participants: { create: data.participants.map((p) => ({ userId: p.userId, lastReadAt: p.readH == null ? null : ago(p.readH) })) },
        messages: { create: data.messages.map((m) => ({ authorId: m.from, body: m.body, createdAt: ago(m.h) })) },
      },
    });
  };

  // 1. Анна ↔ преподаватель по лабораторной №5 — ответ преподавателя Анна ещё не прочитала
  const lab5 = await prisma.assignment.findFirst({ where: { groupId: c.annaGroupId, title: { startsWith: "Лабораторная №5" } }, select: { id: true, title: true } });
  await conv({
    kind: "DIRECT",
    subject: "Открытая адресация в лабораторной №5",
    startedById: c.annaUserId,
    context: lab5 ? { type: "ASSIGNMENT", id: lab5.id, label: `задание «${lab5.title}»` } : undefined,
    participants: [
      { userId: c.annaUserId, readH: 20 },
      { userId: c.teacherUserId, readH: 3 },
    ],
    messages: [
      { from: c.annaUserId, body: "Здравствуйте! Можно ли в лабораторной №5 вместо цепочек сделать открытую адресацию? Хочу сравнить оба способа.", h: 20 },
      { from: c.teacherUserId, body: "Здравствуйте, Анна. Можно, это даже интереснее. Только в отчёте приведите таблицу замеров для обоих вариантов при заполнении 50 % и 90 %.", h: 3 },
    ],
  });

  // 2. Пётр → деканат по заявлению на пересдачу — новое обращение без ответа
  const retake = await prisma.request.findFirst({ where: { student: { userId: c.petrUserId }, type: { code: "APP_RETAKE" } }, select: { id: true, number: true } });
  await conv({
    kind: "DEANERY",
    subject: "Пересдача: комиссия или преподаватель",
    facultyId: c.petrFacultyId,
    startedById: c.petrUserId,
    context: retake ? { type: "REQUEST", id: retake.id, label: `заявка № ${retake.number} «Заявление на пересдачу»` } : undefined,
    participants: [{ userId: c.petrUserId, readH: 2 }],
    messages: [{ from: c.petrUserId, body: "Добрый день! Хотел бы сдавать пересдачу преподавателю, если можно. В какое время лучше подойти за допуском?", h: 2 }],
  });

  // 3. Анна → деканат, решено
  await conv({
    kind: "DEANERY",
    subject: "Нужна ли печать на справке об обучении?",
    facultyId: c.annaFacultyId,
    startedById: c.annaUserId,
    status: "RESOLVED",
    participants: [
      { userId: c.annaUserId, readH: 40 },
      { userId: c.staffUserId, readH: 44 },
    ],
    messages: [
      { from: c.annaUserId, body: "Здравствуйте! Банк просит справку об обучении. Подойдёт электронная с QR-кодом или нужна бумажная с печатью?", h: 46 },
      { from: c.staffUserId, body: "Здравствуйте! Банкам обычно достаточно электронной справки с QR-кодом — подлинность проверяется по ссылке. Если банк всё же попросит печать, отметьте «нужна бумажная копия» в заявке.", h: 44 },
    ],
  });

  // 4. Преподаватель → деканат
  await conv({
    kind: "DEANERY",
    subject: "Проектор в Лаб. 3",
    facultyId: c.annaFacultyId, // деканат факультета, где преподаватель ведёт пары
    startedById: c.teacherUserId,
    participants: [
      { userId: c.teacherUserId, readH: 25 },
      { userId: c.staffUserId, readH: 25 },
    ],
    messages: [
      { from: c.teacherUserId, body: "В Лаб. 3 не работает проектор, а в понедельник там лекция у ИВТ-24-1. Можно перенести в аудиторию с проектором?", h: 28 },
      { from: c.staffUserId, body: "Заявку в хозслужбу передали. Если к понедельнику не починят — перенесём лекцию в 401, студенты получат уведомление.", h: 26 },
    ],
  });

  // 5. Деканат → Пётр — напоминание, Пётр ещё не прочитал
  await conv({
    kind: "DEANERY",
    subject: "Пересдача по методам оптимальных решений",
    facultyId: c.petrFacultyId,
    startedById: c.staffUserId,
    participants: [
      { userId: c.petrUserId, readH: null },
      { userId: c.staffUserId, readH: 5 },
    ],
    messages: [{ from: c.staffUserId, body: "Пётр, напоминаем: пересдача в эту пятницу в 15:40, ауд. 306. Возьмите зачётную книжку и допуск из каб. 204.", h: 5 }],
  });
}
