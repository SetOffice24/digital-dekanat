import "server-only";
/**
 * Сообщения между студентами, преподавателями и деканатом.
 *
 * Кто кому пишет (проверяется здесь, на сервере, при каждом действии):
 * - студент ↔ преподаватель — только если преподаватель ведёт занятия у группы студента (DIRECT);
 * - студент / преподаватель ↔ деканат — деканату как отделу (DEANERY): видят все сотрудники деканата
 *   нужного факультета (сотрудник без привязки к факультету — все обращения);
 * - деканат → студент своего факультета / преподаватель — тоже DEANERY (ответ придёт «в деканат»);
 * - студент ↔ студент — нельзя.
 * Чужой диалог и чужое вложение — 404 (null).
 */
import type { ConversationKind, Prisma, Role } from "@prisma/client";
import { prisma } from "../db";
import { sendPush } from "../push";
import { storeFiles, removeStored } from "../files";

export type Viewer = {
  id: string;
  role: Role;
  student: { id: string; groupId: string; facultyId: string } | null;
  staff: { id: string; facultyId: string | null } | null;
  teacher: { id: string } | null;
};

export class MessageError extends Error {}

const MAX_BODY = 4000;

/** «Свой» преподаватель — тот, у кого есть занятия с группой в текущем учебном периоде (не любые исторические). */
const currentLessons = () => ({ date: { gte: new Date(Date.now() - 150 * 86400_000) } });

/* ---------- видимость ---------- */

const staffScope = (facultyId: string | null): Prisma.ConversationWhereInput => ({ kind: "DEANERY", ...(facultyId ? { facultyId } : {}) });

/** Условие «диалоги, которые видит пользователь». */
export function visibleWhere(v: Viewer): Prisma.ConversationWhereInput {
  if (v.role === "STAFF" && v.staff) return staffScope(v.staff.facultyId);
  return { participants: { some: { userId: v.id } } };
}

/* ---------- имена ---------- */

const userNameSelect = {
  id: true,
  role: true,
  student: { select: { lastName: true, firstName: true, group: { select: { name: true } } } },
  teacher: { select: { fullName: true } },
  staff: { select: { fullName: true } },
} satisfies Prisma.UserSelect;
type UserName = Prisma.UserGetPayload<{ select: typeof userNameSelect }>;

export function displayName(u: UserName) {
  if (u.student) return `${u.student.lastName} ${u.student.firstName}`;
  if (u.teacher) return u.teacher.fullName;
  if (u.staff) return u.staff.fullName;
  return "Пользователь";
}
export function displaySub(u: UserName) {
  if (u.student) return `студент, ${u.student.group.name}`;
  if (u.teacher) return "преподаватель";
  if (u.staff) return "деканат";
  return "";
}

/* ---------- список диалогов ---------- */

const listInclude = {
  participants: { include: { user: { select: userNameSelect } } },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1, include: { author: { select: { id: true, role: true } } } },
} satisfies Prisma.ConversationInclude;
type ConvForList = Prisma.ConversationGetPayload<{ include: typeof listInclude }>;

/** С кем диалог — с точки зрения смотрящего. */
function counterpart(v: Viewer, c: ConvForList) {
  if (c.kind === "DEANERY" && v.role !== "STAFF") return { title: "Деканат", sub: "обращение" };
  const other = c.participants.find((p) => p.user.id !== v.id && (c.kind === "DIRECT" || p.user.role !== "STAFF"));
  return other ? { title: displayName(other.user), sub: displaySub(other.user) } : { title: "Диалог", sub: "" };
}

function isUnread(v: Viewer, c: ConvForList) {
  const last = c.messages[0];
  if (!last || last.author.id === v.id) return false;
  // для деканата «своё» — любое сообщение сотрудника
  if (v.role === "STAFF" && last.author.role === "STAFF") return false;
  const me = c.participants.find((p) => p.userId === v.id);
  return !me?.lastReadAt || me.lastReadAt < last.createdAt;
}

export type InboxFilter = "new" | "open" | "resolved" | "all";

export async function listConversations(v: Viewer, filter: InboxFilter = "all", q?: string) {
  const where: Prisma.ConversationWhereInput = { ...visibleWhere(v) };
  if (filter === "resolved") where.status = "RESOLVED";
  if (filter === "open" || filter === "new") where.status = "OPEN";
  const rows = await prisma.conversation.findMany({ where, include: listInclude, orderBy: { lastMessageAt: "desc" }, take: 200 });
  const needle = q?.trim().toLowerCase();
  return rows
    .map((c) => {
      const who = counterpart(v, c);
      const last = c.messages[0];
      // для деканата «новое» — последнее сообщение не от сотрудника
      const awaiting = v.role === "STAFF" && c.status === "OPEN" && last?.author.role !== "STAFF";
      return { id: c.id, kind: c.kind, status: c.status, subject: c.subject, contextLabel: c.contextLabel, lastMessageAt: c.lastMessageAt, preview: last?.body.slice(0, 120) ?? "", lastFromMe: last?.author.id === v.id, unread: isUnread(v, c), awaiting, ...who };
    })
    .filter((c) => (filter === "new" ? c.awaiting : true))
    .filter((c) => !needle || `${c.title} ${c.subject}`.toLowerCase().includes(needle));
}

/** Сколько диалогов с непрочитанными (для значка в шапке). Деканат — плюс новые обращения без ответа. */
export async function unreadConversations(v: Viewer) {
  const list = await listConversations(v, "all");
  return list.filter((c) => c.unread || c.awaiting).length;
}

/* ---------- диалог ---------- */

/** Диалог целиком; отмечает прочитанным. Нет доступа → null. */
export async function openConversation(v: Viewer, id: string) {
  const c = await prisma.conversation.findFirst({
    where: { id, ...visibleWhere(v) },
    include: {
      participants: { include: { user: { select: userNameSelect } } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: userNameSelect }, files: { select: { id: true, name: true, size: true } } } },
    },
  });
  if (!c) return null;
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: id, userId: v.id } },
    create: { conversationId: id, userId: v.id, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
  const who = counterpart(v, { ...c, messages: c.messages.slice(-1).map((m) => ({ ...m, author: { id: m.author.id, role: m.author.role } })) } as ConvForList);
  return { conversation: c, ...who, contextHref: await contextHref(v, c.contextType, c.contextId) };
}

/* ---------- повод (контекст) ---------- */

export type ContextType = "REQUEST" | "COURSE" | "ASSIGNMENT";

/** Проверить, что повод принадлежит области пользователя, и получить подпись. Чужой повод → null. */
export async function resolveContext(v: Viewer, type: ContextType, id: string): Promise<{ label: string; teacherUserIds?: string[] } | null> {
  if (type === "REQUEST") {
    const r = await prisma.request.findFirst({
      where: { id, ...(v.role === "STUDENT" ? { studentId: v.student?.id ?? "-" } : v.role === "STAFF" ? (v.staff?.facultyId ? { student: { facultyId: v.staff.facultyId } } : {}) : { id: "-" }) },
      select: { number: true, type: { select: { title: true } } },
    });
    return r ? { label: `заявка № ${r.number} «${r.type.title}»` } : null;
  }
  if (type === "ASSIGNMENT") {
    const a = await prisma.assignment.findFirst({
      where: { id, ...(v.role === "STUDENT" ? { groupId: v.student?.groupId ?? "-" } : v.role === "TEACHER" ? { teacherId: v.teacher?.id ?? "-" } : {}) },
      select: { title: true, teacher: { select: { userId: true } } },
    });
    return a ? { label: `задание «${a.title}»`, teacherUserIds: a.teacher.userId ? [a.teacher.userId] : [] } : null;
  }
  // COURSE
  const course = await prisma.course.findUnique({ where: { id }, select: { name: true } });
  if (!course) return null;
  if (v.role === "STUDENT") {
    const enrolled = await prisma.enrollment.count({ where: { studentId: v.student?.id ?? "-", courseId: id } });
    if (!enrolled) return null;
    const ts = await prisma.lesson.findMany({ where: { groupId: v.student!.groupId, courseId: id }, distinct: ["teacherId"], select: { teacher: { select: { userId: true } } } });
    return { label: `дисциплина «${course.name}»`, teacherUserIds: ts.map((t) => t.teacher.userId).filter((x): x is string => !!x) };
  }
  if (v.role === "TEACHER") {
    const teaches = await prisma.lesson.count({ where: { teacherId: v.teacher?.id ?? "-", courseId: id } });
    return teaches ? { label: `дисциплина «${course.name}»` } : null;
  }
  return { label: `дисциплина «${course.name}»` };
}

async function contextHref(v: Viewer, type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "REQUEST") return v.role === "STUDENT" ? `/requests/${id}` : v.role === "STAFF" ? `/staff/requests/${id}` : null;
  if (type === "ASSIGNMENT") {
    if (v.role === "STUDENT") return `/homework/${id}`;
    if (v.role === "TEACHER") {
      const a = await prisma.assignment.findFirst({ where: { id, teacherId: v.teacher?.id ?? "-" }, select: { groupId: true, courseId: true } });
      return a ? `/teacher/${a.groupId}/${a.courseId}/homework/${id}` : null;
    }
    return null;
  }
  if (type === "COURSE") return v.role === "STUDENT" ? `/courses/${id}` : null;
  return null;
}

/* ---------- адресаты ---------- */

export type Recipient = { key: string; title: string; sub: string };

/** Кому пользователь может написать. key: "deanery" или id пользователя. */
export async function recipients(v: Viewer): Promise<Recipient[]> {
  if (v.role === "STUDENT" && v.student) {
    const lessons = await prisma.lesson.findMany({ where: { groupId: v.student.groupId, teacher: { userId: { not: null } }, ...currentLessons() }, distinct: ["teacherId", "courseId"], select: { teacher: { select: { userId: true, fullName: true } }, course: { select: { name: true } } } });
    const byTeacher = new Map<string, { title: string; courses: string[] }>();
    for (const l of lessons) {
      const t = byTeacher.get(l.teacher.userId!) ?? { title: l.teacher.fullName, courses: [] };
      t.courses.push(l.course.name);
      byTeacher.set(l.teacher.userId!, t);
    }
    return [{ key: "deanery", title: "Деканат", sub: "заявки, справки, расписание, любые вопросы" }, ...[...byTeacher].map(([id, t]) => ({ key: id, title: t.title, sub: `преподаватель: ${t.courses.join(", ")}` }))];
  }
  if (v.role === "TEACHER" && v.teacher) {
    const groups = await prisma.lesson.findMany({ where: { teacherId: v.teacher.id, ...currentLessons() }, distinct: ["groupId"], select: { groupId: true } });
    const students = await prisma.student.findMany({ where: { groupId: { in: groups.map((g) => g.groupId) } }, orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }], select: { userId: true, lastName: true, firstName: true, group: { select: { name: true } } } });
    return [{ key: "deanery", title: "Деканат", sub: "вопросы по расписанию, группам, документам" }, ...students.map((s) => ({ key: s.userId, title: `${s.lastName} ${s.firstName}`, sub: `студент, ${s.group.name}` }))];
  }
  if (v.role === "STAFF" && v.staff) {
    const [students, teachers] = await Promise.all([
      prisma.student.findMany({ where: v.staff.facultyId ? { facultyId: v.staff.facultyId } : {}, orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }], select: { userId: true, lastName: true, firstName: true, group: { select: { name: true } } } }),
      prisma.teacher.findMany({ where: { userId: { not: null } }, orderBy: { fullName: "asc" }, select: { userId: true, fullName: true, department: true } }),
    ]);
    return [...teachers.map((t) => ({ key: t.userId!, title: t.fullName, sub: `преподаватель, ${t.department}` })), ...students.map((s) => ({ key: s.userId, title: `${s.lastName} ${s.firstName}`, sub: `студент, ${s.group.name}` }))];
  }
  return [];
}

/* ---------- отправка ---------- */

const hits = new Map<string, number[]>();
function rateLimited(userId: string) {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > 40;
}

const cleanBody = (b: string) => b.replace(/\r\n/g, "\n").trim().slice(0, MAX_BODY);

/** Начать диалог. to = "deanery" или id пользователя-адресата. */
export async function startConversation(
  v: Viewer,
  input: { to: string; subject: string; body: string; files: File[]; context?: { type: ContextType; id: string } | null },
) {
  const body = cleanBody(input.body);
  const subject = input.subject.trim().slice(0, 150);
  if (!body && !input.files.length) throw new MessageError("Напишите сообщение");
  if (!subject) throw new MessageError("Укажите тему");
  if (rateLimited(v.id)) throw new MessageError("Слишком много сообщений. Подождите несколько минут.");

  let kind: ConversationKind;
  let facultyId: string | null = null;
  const participantIds = [v.id];

  if (input.to === "deanery") {
    if (v.role === "STAFF") throw new MessageError("Сотрудник деканата пишет студенту или преподавателю");
    kind = "DEANERY";
    facultyId = v.role === "STUDENT" ? (v.student?.facultyId ?? null) : null;
  } else {
    const target = await prisma.user.findUnique({ where: { id: input.to }, select: { id: true, role: true, student: { select: { groupId: true, facultyId: true } }, teacher: { select: { id: true } } } });
    if (!target || target.id === v.id) throw new MessageError("Адресат не найден");
    if (v.role === "STUDENT" && target.role === "TEACHER" && target.teacher && v.student) {
      const teaches = await prisma.lesson.count({ where: { teacherId: target.teacher.id, groupId: v.student.groupId, ...currentLessons() } });
      if (!teaches) throw new MessageError("Можно писать только преподавателям своих дисциплин");
      kind = "DIRECT";
    } else if (v.role === "TEACHER" && target.role === "STUDENT" && target.student && v.teacher) {
      const teaches = await prisma.lesson.count({ where: { teacherId: v.teacher.id, groupId: target.student.groupId, ...currentLessons() } });
      if (!teaches) throw new MessageError("Можно писать только студентам своих групп");
      kind = "DIRECT";
    } else if (v.role === "STAFF" && v.staff && (target.role === "STUDENT" || target.role === "TEACHER")) {
      if (target.student && v.staff.facultyId && target.student.facultyId !== v.staff.facultyId) throw new MessageError("Студент другого факультета");
      kind = "DEANERY";
      facultyId = target.student?.facultyId ?? null;
    } else {
      throw new MessageError("Этому адресату писать нельзя");
    }
    participantIds.push(target.id);
  }

  let contextLabel: string | null = null;
  if (input.context) {
    const ctx = await resolveContext(v, input.context.type, input.context.id);
    if (!ctx) throw new MessageError("Повод для сообщения не найден");
    contextLabel = ctx.label;
  }

  const stored = await storeFiles(input.files, v.id);
  try {
    const conv = await prisma.conversation.create({
      data: {
        kind,
        subject,
        facultyId,
        startedById: v.id,
        contextType: input.context?.type ?? null,
        contextId: input.context?.id ?? null,
        contextLabel,
        participants: { create: participantIds.map((userId) => ({ userId, lastReadAt: userId === v.id ? new Date() : null })) },
        messages: { create: { authorId: v.id, body, files: { create: stored } } },
      },
    });
    await pushRecipients(v, conv.id);
    return conv;
  } catch (e) {
    await removeStored(stored.map((s) => s.storageKey));
    throw e;
  }
}

/** Ответ в диалоге. Ответ студента/преподавателя в решённое обращение открывает его снова. */
export async function replyToConversation(v: Viewer, id: string, input: { body: string; files: File[] }) {
  const c = await prisma.conversation.findFirst({ where: { id, ...visibleWhere(v) }, select: { id: true, kind: true, status: true } });
  if (!c) throw new MessageError("Диалог не найден");
  const body = cleanBody(input.body);
  if (!body && !input.files.length) throw new MessageError("Напишите сообщение");
  if (rateLimited(v.id)) throw new MessageError("Слишком много сообщений. Подождите несколько минут.");
  const stored = await storeFiles(input.files, v.id);
  try {
    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({ data: { conversationId: id, authorId: v.id, body, files: { create: stored } } }),
      prisma.conversation.update({ where: { id }, data: { lastMessageAt: now, ...(c.status === "RESOLVED" && v.role !== "STAFF" ? { status: "OPEN", resolvedAt: null } : {}) } }),
      prisma.conversationParticipant.upsert({ where: { conversationId_userId: { conversationId: id, userId: v.id } }, create: { conversationId: id, userId: v.id, lastReadAt: now }, update: { lastReadAt: now } }),
    ]);
  } catch (e) {
    await removeStored(stored.map((s) => s.storageKey));
    throw e;
  }
  await pushRecipients(v, id);
}

/** Деканат: отметить обращение решённым или открыть снова. */
export async function setConversationStatus(v: Viewer, id: string, status: "OPEN" | "RESOLVED") {
  if (v.role !== "STAFF" || !v.staff) return false;
  const c = await prisma.conversation.findFirst({ where: { id, ...staffScope(v.staff.facultyId) }, select: { id: true } });
  if (!c) return false;
  await prisma.conversation.update({ where: { id }, data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null } });
  return true;
}

/** Push получателям: в личном диалоге — собеседнику; в обращении — от деканата участникам, от студента/преподавателя — сотрудникам деканата нужного факультета. */
async function pushRecipients(v: Viewer, conversationId: string) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { kind: true, facultyId: true, subject: true, participants: { select: { userId: true, user: { select: { role: true } } } } } });
  if (!c) return;
  let to: string[];
  if (c.kind === "DIRECT" || v.role === "STAFF") to = c.participants.filter((p) => p.userId !== v.id && p.user.role !== "STAFF").map((p) => p.userId);
  else {
    const staff = await prisma.staff.findMany({ where: { OR: [{ facultyId: null }, ...(c.facultyId ? [{ facultyId: c.facultyId }] : [])] }, select: { userId: true } });
    to = staff.map((s) => s.userId);
  }
  const from = v.role === "STAFF" ? "Деканат" : await prisma.user.findUnique({ where: { id: v.id }, select: userNameSelect }).then((u) => (u ? displayName(u) : "Сообщение"));
  const base = (role: Role) => (role === "STAFF" ? "/staff/messages" : role === "TEACHER" ? "/teacher/messages" : "/messages");
  const roles = await prisma.user.findMany({ where: { id: { in: to } }, select: { id: true, role: true } });
  for (const r of roles) {
    // на экране блокировки — без текста и вложений (их могут увидеть посторонние); читать — в кабинете
    void sendPush([r.id], { title: "Новое сообщение", body: `От: ${from}`, url: `${base(r.role)}/${conversationId}`, tag: `msg-${conversationId}` }).catch(() => {});
  }
}

/** Пользователь из сессии → Viewer для проверок прав. */
export function viewerOf(user: { id: string; role: Role; student: { id: string; groupId: string; facultyId: string } | null; staff: { id: string; facultyId: string | null } | null; teacher: { id: string } | null }): Viewer {
  return { id: user.id, role: user.role, student: user.student, staff: user.staff, teacher: user.teacher };
}
