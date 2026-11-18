import "server-only";
/**
 * Сообщения между студентами, преподавателями и деканатом.
 *
 * Кто кому пишет (проверяется здесь, на сервере, при каждом действии):
 * - студент ↔ преподаватель — только если преподаватель ведёт занятия у группы студента в текущем периоде (DIRECT);
 *   если связь пропала (перевод, новый семестр) — переписка остаётся, но только для чтения;
 * - студент / преподаватель → деканат — деканату как отделу (DEANERY): видят сотрудники нужного факультета
 *   (студент — своего; преподаватель — факультета групп, где ведёт пары, при нескольких выбирает);
 *   сотрудник без привязки к факультету видит все обращения;
 * - деканат → студент своего факультета / преподаватель, ведущий пары на факультете — тоже DEANERY своего факультета;
 * - студент ↔ студент — нельзя.
 * Повод (заявка / дисциплина / задание) должен относиться и к отправителю, и к адресату.
 * Чужой диалог и чужое вложение — 404 (null).
 */
import { Prisma, type ConversationKind, type Role } from "@prisma/client";
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

export const MAX_BODY = 4000;
export const MAX_SUBJECT = 150;

/** «Свой» преподаватель — тот, у кого есть занятия с группой в текущем учебном периоде (не любые исторические). */
const currentLessons = () => ({ date: { gte: new Date(Date.now() - 150 * 86400_000) } });

const teachesGroup = async (teacherId: string, groupId: string, courseId?: string) =>
  (await prisma.lesson.count({ where: { teacherId, groupId, ...(courseId ? { courseId } : {}), ...currentLessons() } })) > 0;

const teachesInFaculty = async (teacherId: string, facultyId: string) =>
  (await prisma.lesson.count({ where: { teacherId, group: { program: { facultyId } }, ...currentLessons() } })) > 0;

/** Факультеты, где преподаватель ведёт пары в текущем периоде — туда и идут его обращения в деканат. */
async function teacherFaculties(teacherId: string) {
  const rows = await prisma.lesson.findMany({
    where: { teacherId, ...currentLessons() },
    distinct: ["groupId"],
    select: { group: { select: { program: { select: { faculty: { select: { id: true, name: true, shortName: true } } } } } } },
  });
  const m = new Map<string, { id: string; name: string; shortName: string }>();
  for (const r of rows) m.set(r.group.program.faculty.id, r.group.program.faculty);
  return [...m.values()].sort((a, b) => a.shortName.localeCompare(b.shortName, "ru"));
}

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

/** Поиск — в базе (тема и имена участников), а не по первым 200 загруженным диалогам. */
function searchWhere(q?: string): Prisma.ConversationWhereInput {
  const n = q?.trim().slice(0, 60);
  if (!n) return {};
  const like = { contains: n, mode: "insensitive" as const };
  return {
    OR: [
      { subject: like },
      { contextLabel: like },
      { participants: { some: { user: { OR: [{ student: { OR: [{ lastName: like }, { firstName: like }] } }, { teacher: { fullName: like } }, { staff: { fullName: like } }] } } } },
      ...("деканат".includes(n.toLowerCase()) || n.toLowerCase().startsWith("декан") ? [{ kind: "DEANERY" as const }] : []),
    ],
  };
}

export async function listConversations(v: Viewer, filter: InboxFilter = "all", q?: string) {
  const where: Prisma.ConversationWhereInput = { AND: [visibleWhere(v), searchWhere(q)] };
  if (filter === "resolved") where.status = "RESOLVED";
  if (filter === "open" || filter === "new") where.status = "OPEN";
  const rows = await prisma.conversation.findMany({ where, include: listInclude, orderBy: { lastMessageAt: "desc" }, take: 200 });
  return rows
    .map((c) => {
      const who = counterpart(v, c);
      const last = c.messages[0];
      // для деканата «новое» — последнее сообщение не от сотрудника
      const awaiting = v.role === "STAFF" && c.status === "OPEN" && last?.author.role !== "STAFF";
      return { id: c.id, kind: c.kind, status: c.status, subject: c.subject, contextLabel: c.contextLabel, lastMessageAt: c.lastMessageAt, preview: last?.body.slice(0, 120) ?? "", lastFromMe: last?.author.id === v.id, unread: isUnread(v, c), awaiting, ...who };
    })
    .filter((c) => (filter === "new" ? c.awaiting : true));
}

/**
 * Счётчик для значка в шапке — одним запросом по всей базе (без ограничения «последние 200»).
 * Студент/преподаватель — диалоги, где есть чужие сообщения новее его отметки прочтения.
 * Деканат — открытые обращения, где последнее слово не за сотрудником.
 */
export async function unreadConversations(v: Viewer) {
  if (v.role === "STAFF" && v.staff) {
    const fac = v.staff.facultyId;
    const [r] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM "Conversation" c
      WHERE c."kind" = 'DEANERY' AND c."status" = 'OPEN'
        AND (${fac}::text IS NULL OR c."facultyId" = ${fac})
        AND (SELECT u."role" FROM "Message" m JOIN "User" u ON u."id" = m."authorId"
             WHERE m."conversationId" = c."id" ORDER BY m."createdAt" DESC LIMIT 1) <> 'STAFF'`);
    return r?.n ?? 0;
  }
  const [r] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT count(*)::int AS n FROM "ConversationParticipant" p
    WHERE p."userId" = ${v.id}
      AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = p."conversationId" AND m."authorId" <> ${v.id}
                  AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt"))`);
  return r?.n ?? 0;
}

/* ---------- диалог ---------- */

/** Можно ли ещё отвечать в личном диалоге: связь «преподаватель ведёт пары у группы студента» должна быть актуальной. */
async function directStillAllowed(participantUserIds: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: participantUserIds } }, select: { student: { select: { groupId: true } }, teacher: { select: { id: true } } } });
  const st = users.find((u) => u.student)?.student;
  const t = users.find((u) => u.teacher)?.teacher;
  return Boolean(st && t && (await teachesGroup(t.id, st.groupId)));
}

/** Диалог целиком; отмечает прочитанным до последнего показанного сообщения. Нет доступа → null. */
export async function openConversation(v: Viewer, id: string) {
  const c = await prisma.conversation.findFirst({
    where: { id, ...visibleWhere(v) },
    include: {
      participants: { include: { user: { select: userNameSelect } } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: userNameSelect }, files: { select: { id: true, name: true, size: true } } } },
    },
  });
  if (!c) return null;
  // не «сейчас»: сообщение, пришедшее между чтением и отметкой, не должно считаться прочитанным
  const readUpTo = c.messages.at(-1)?.createdAt ?? new Date();
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: id, userId: v.id } },
    create: { conversationId: id, userId: v.id, lastReadAt: readUpTo },
    update: { lastReadAt: readUpTo },
  });
  const who = counterpart(v, { ...c, messages: c.messages.slice(-1).map((m) => ({ ...m, author: { id: m.author.id, role: m.author.role } })) } as ConvForList);
  const canReply = c.kind === "DIRECT" ? await directStillAllowed(c.participants.map((p) => p.userId)) : true;
  return { conversation: c, ...who, canReply, contextHref: await contextHref(v, c.contextType, c.contextId) };
}

/* ---------- повод (контекст) ---------- */

export type ContextType = "REQUEST" | "COURSE" | "ASSIGNMENT";

/** Проверить, что повод принадлежит области пользователя, и получить подпись. Чужой повод → null. */
export async function resolveContext(v: Viewer, type: ContextType, id: string): Promise<{ label: string; teacherUserIds?: string[] } | null> {
  const staffFaculty = v.role === "STAFF" ? (v.staff?.facultyId ?? null) : null;
  if (type === "REQUEST") {
    const r = await prisma.request.findFirst({
      where: { id, ...(v.role === "STUDENT" ? { studentId: v.student?.id ?? "-" } : v.role === "STAFF" ? (staffFaculty ? { student: { facultyId: staffFaculty } } : {}) : { id: "-" }) },
      select: { number: true, type: { select: { title: true } } },
    });
    return r ? { label: `заявка № ${r.number} «${r.type.title}»` } : null;
  }
  if (type === "ASSIGNMENT") {
    const a = await prisma.assignment.findFirst({
      where: {
        id,
        ...(v.role === "STUDENT" ? { groupId: v.student?.groupId ?? "-" } : v.role === "TEACHER" ? { teacherId: v.teacher?.id ?? "-" } : staffFaculty ? { group: { program: { facultyId: staffFaculty } } } : {}),
      },
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
  if (staffFaculty && !(await prisma.lesson.count({ where: { courseId: id, group: { program: { facultyId: staffFaculty } } } }))) return null;
  return { label: `дисциплина «${course.name}»` };
}

type Target = { kind: "deanery" } | { kind: "user"; role: Role; studentId?: string; groupId?: string; teacherId?: string };

/** Повод должен относиться и к адресату: задание — его группы или его преподавателя, заявка — этого студента и т. п. */
async function contextFitsTarget(v: Viewer, ctx: { type: ContextType; id: string }, t: Target) {
  if (t.kind === "deanery") return true; // деканат видит всё в своей области, доступ отправителя уже проверен
  if (ctx.type === "REQUEST") {
    if (t.role !== "STUDENT" || v.role !== "STAFF") return false; // заявки обсуждаются со студентом через деканат
    return (await prisma.request.count({ where: { id: ctx.id, studentId: t.studentId } })) > 0;
  }
  if (ctx.type === "ASSIGNMENT") {
    const a = await prisma.assignment.findUnique({ where: { id: ctx.id }, select: { groupId: true, teacherId: true } });
    if (!a) return false;
    if (t.role === "TEACHER") return a.teacherId === t.teacherId;
    if (t.role === "STUDENT") return a.groupId === t.groupId || (await prisma.submission.count({ where: { assignmentId: ctx.id, studentId: t.studentId } })) > 0;
    return false;
  }
  // COURSE
  if (t.role === "TEACHER") {
    const groupId = v.role === "STUDENT" ? v.student!.groupId : undefined;
    return (await prisma.lesson.count({ where: { teacherId: t.teacherId, courseId: ctx.id, ...(groupId ? { groupId } : {}) } })) > 0;
  }
  if (t.role === "STUDENT") return (await prisma.enrollment.count({ where: { studentId: t.studentId, courseId: ctx.id } })) > 0;
  return false;
}

/** Ссылка на повод — только если объект доступен смотрящему (иначе получатель попал бы на 404). */
async function contextHref(v: Viewer, type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "REQUEST") {
    if (v.role === "STUDENT") return (await prisma.request.count({ where: { id, studentId: v.student?.id ?? "-" } })) ? `/requests/${id}` : null;
    if (v.role === "STAFF") return (await prisma.request.count({ where: { id, ...(v.staff?.facultyId ? { student: { facultyId: v.staff.facultyId } } : {}) } })) ? `/staff/requests/${id}` : null;
    return null;
  }
  if (type === "ASSIGNMENT") {
    if (v.role === "STUDENT") {
      const ok = await prisma.assignment.count({ where: { id, OR: [{ groupId: v.student?.groupId ?? "-" }, { submissions: { some: { studentId: v.student?.id ?? "-" } } }] } });
      return ok ? `/homework/${id}` : null;
    }
    if (v.role === "TEACHER") {
      const a = await prisma.assignment.findFirst({ where: { id, teacherId: v.teacher?.id ?? "-" }, select: { groupId: true, courseId: true } });
      return a ? `/teacher/${a.groupId}/${a.courseId}/homework/${id}` : null;
    }
    return null;
  }
  if (type === "COURSE" && v.role === "STUDENT") return (await prisma.enrollment.count({ where: { studentId: v.student?.id ?? "-", courseId: id } })) ? `/courses/${id}` : null;
  return null;
}

/* ---------- адресаты ---------- */

export type Recipient = { key: string; title: string; sub: string };

/** Кому пользователь может написать. key: "deanery", "deanery:<факультет>" или id пользователя. */
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
    const [faculties, groups] = await Promise.all([teacherFaculties(v.teacher.id), prisma.lesson.findMany({ where: { teacherId: v.teacher.id, ...currentLessons() }, distinct: ["groupId"], select: { groupId: true } })]);
    const students = await prisma.student.findMany({ where: { groupId: { in: groups.map((g) => g.groupId) } }, orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }], select: { userId: true, lastName: true, firstName: true, group: { select: { name: true } } } });
    const deanery: Recipient[] =
      faculties.length > 1
        ? faculties.map((f) => ({ key: `deanery:${f.id}`, title: `Деканат ${f.shortName}`, sub: f.name }))
        : [{ key: faculties[0] ? `deanery:${faculties[0].id}` : "deanery", title: "Деканат", sub: "вопросы по расписанию, группам, документам" }];
    return [...deanery, ...students.map((s) => ({ key: s.userId, title: `${s.lastName} ${s.firstName}`, sub: `студент, ${s.group.name}` }))];
  }
  if (v.role === "STAFF" && v.staff) {
    const fac = v.staff.facultyId;
    const [students, teachers] = await Promise.all([
      prisma.student.findMany({ where: fac ? { facultyId: fac } : {}, orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }], select: { userId: true, lastName: true, firstName: true, group: { select: { name: true } } } }),
      // преподаватели, которые ведут пары на факультете сотрудника (сотрудник без факультета — все)
      prisma.teacher.findMany({ where: { userId: { not: null }, ...(fac ? { lessons: { some: { group: { program: { facultyId: fac } }, ...currentLessons() } } } : {}) }, orderBy: { fullName: "asc" }, select: { userId: true, fullName: true, department: true } }),
    ]);
    return [...teachers.map((t) => ({ key: t.userId!, title: t.fullName, sub: `преподаватель, ${t.department}` })), ...students.map((s) => ({ key: s.userId, title: `${s.lastName} ${s.firstName}`, sub: `студент, ${s.group.name}` }))];
  }
  return [];
}

/* ---------- отправка ---------- */

// Ограничение частоты — в памяти одного процесса (для прототипа на одном сервере этого достаточно;
// при нескольких копиях приложения нужен общий счётчик). Учитываются только прошедшие проверки отправки.
const hits = new Map<string, number[]>();
function rateLimited(userId: string) {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > 40;
}

/** Текст без молчаливого обрезания: длиннее лимита — понятная ошибка. */
function cleanBody(b: string) {
  const body = b.replace(/\r\n/g, "\n").trim();
  if (body.length > MAX_BODY) throw new MessageError(`Сообщение не должно превышать ${MAX_BODY} символов (сейчас ${body.length})`);
  return body;
}

const isDuplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const byKey = (authorId: string, clientKey?: string | null) =>
  clientKey ? prisma.message.findUnique({ where: { authorId_clientKey: { authorId, clientKey } }, select: { conversationId: true } }) : Promise.resolve(null);

/** Push не должен превращать уже сохранённое сообщение в ошибку для пользователя. */
function pushSafely(v: Viewer, conversationId: string) {
  void pushRecipients(v, conversationId).catch((e) => console.error("message push failed", e));
}

/**
 * Начать диалог. to = "deanery", "deanery:<факультет>" (преподаватель) или id пользователя-адресата.
 * clientKey — ключ отправки из браузера: повтор того же запроса возвращает уже созданный диалог.
 */
export async function startConversation(
  v: Viewer,
  input: { to: string; subject: string; body: string; files: File[]; context?: { type: ContextType; id: string } | null; clientKey?: string | null },
) {
  const again = await byKey(v.id, input.clientKey);
  if (again) return prisma.conversation.findUniqueOrThrow({ where: { id: again.conversationId } });

  const body = cleanBody(input.body);
  const subject = input.subject.trim();
  if (!body && !input.files.length) throw new MessageError("Напишите сообщение");
  if (!subject) throw new MessageError("Укажите тему");
  if (subject.length > MAX_SUBJECT) throw new MessageError(`Тема — не длиннее ${MAX_SUBJECT} символов`);

  let kind: ConversationKind;
  let facultyId: string | null = null;
  let target: Target;
  const participantIds = [v.id];

  if (input.to === "deanery" || input.to.startsWith("deanery:")) {
    if (v.role === "STAFF") throw new MessageError("Сотрудник деканата пишет студенту или преподавателю");
    kind = "DEANERY";
    target = { kind: "deanery" };
    const asked = input.to.startsWith("deanery:") ? input.to.slice(8) : null;
    if (v.role === "STUDENT") {
      facultyId = v.student?.facultyId ?? null;
      if (asked && asked !== facultyId) throw new MessageError("Можно писать только в деканат своего факультета");
    } else if (v.teacher) {
      const facs = await teacherFaculties(v.teacher.id);
      if (asked) {
        if (!facs.some((f) => f.id === asked)) throw new MessageError("Вы не ведёте занятия на этом факультете");
        facultyId = asked;
      } else if (facs.length > 1) throw new MessageError("Выберите деканат факультета");
      else facultyId = facs[0]?.id ?? null; // нет текущих пар — общий деканат
    }
  } else {
    const t = await prisma.user.findUnique({ where: { id: input.to }, select: { id: true, role: true, student: { select: { id: true, groupId: true, facultyId: true } }, teacher: { select: { id: true } } } });
    if (!t || t.id === v.id) throw new MessageError("Адресат не найден");
    target = { kind: "user", role: t.role, studentId: t.student?.id, groupId: t.student?.groupId, teacherId: t.teacher?.id };
    if (v.role === "STUDENT" && t.role === "TEACHER" && t.teacher && v.student) {
      if (!(await teachesGroup(t.teacher.id, v.student.groupId))) throw new MessageError("Можно писать только преподавателям своих дисциплин");
      kind = "DIRECT";
    } else if (v.role === "TEACHER" && t.role === "STUDENT" && t.student && v.teacher) {
      if (!(await teachesGroup(v.teacher.id, t.student.groupId))) throw new MessageError("Можно писать только студентам своих групп");
      kind = "DIRECT";
    } else if (v.role === "STAFF" && v.staff && t.role === "STUDENT" && t.student) {
      if (v.staff.facultyId && t.student.facultyId !== v.staff.facultyId) throw new MessageError("Студент другого факультета");
      kind = "DEANERY";
      facultyId = t.student.facultyId;
    } else if (v.role === "STAFF" && v.staff && t.role === "TEACHER" && t.teacher) {
      if (v.staff.facultyId && !(await teachesInFaculty(t.teacher.id, v.staff.facultyId))) throw new MessageError("Преподаватель не ведёт занятия на вашем факультете");
      kind = "DEANERY";
      // обращение остаётся в области написавшего сотрудника — иначе он не увидел бы ответ
      facultyId = v.staff.facultyId;
    } else {
      throw new MessageError("Этому адресату писать нельзя");
    }
    participantIds.push(t.id);
  }

  let contextLabel: string | null = null;
  if (input.context) {
    const ctx = await resolveContext(v, input.context.type, input.context.id);
    if (!ctx) throw new MessageError("Повод для сообщения не найден");
    if (!(await contextFitsTarget(v, input.context, target))) throw new MessageError("Этот повод не относится к выбранному адресату");
    contextLabel = ctx.label;
  }

  if (rateLimited(v.id)) throw new MessageError("Слишком много сообщений. Подождите несколько минут.");
  const stored = await storeFiles(input.files, v.id);
  let conv;
  try {
    conv = await prisma.conversation.create({
      data: {
        kind,
        subject,
        facultyId,
        startedById: v.id,
        contextType: input.context?.type ?? null,
        contextId: input.context?.id ?? null,
        contextLabel,
        participants: { create: participantIds.map((userId) => ({ userId, lastReadAt: userId === v.id ? new Date() : null })) },
        messages: { create: { authorId: v.id, body, clientKey: input.clientKey ?? null, files: { create: stored } } },
      },
    });
  } catch (e) {
    await removeStored(stored.map((s) => s.storageKey));
    const dup = isDuplicate(e) ? await byKey(v.id, input.clientKey) : null;
    if (dup) return prisma.conversation.findUniqueOrThrow({ where: { id: dup.conversationId } });
    throw e;
  }
  pushSafely(v, conv.id);
  return conv;
}

/** Ответ в диалоге. Ответ студента/преподавателя в решённое обращение открывает его снова. Повтор того же clientKey — без дубля. */
export async function replyToConversation(v: Viewer, id: string, input: { body: string; files: File[]; clientKey?: string | null }) {
  const c = await prisma.conversation.findFirst({ where: { id, ...visibleWhere(v) }, select: { id: true, kind: true, status: true, participants: { select: { userId: true } } } });
  if (!c) throw new MessageError("Диалог не найден");
  if (await byKey(v.id, input.clientKey)) return;
  const body = cleanBody(input.body);
  if (!body && !input.files.length) throw new MessageError("Напишите сообщение");
  if (c.kind === "DIRECT" && !(await directStillAllowed(c.participants.map((p) => p.userId))))
    throw new MessageError("Переписка закрыта: преподаватель больше не ведёт занятия у группы. Напишите в деканат.");
  if (rateLimited(v.id)) throw new MessageError("Слишком много сообщений. Подождите несколько минут.");
  const stored = await storeFiles(input.files, v.id);
  try {
    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({ data: { conversationId: id, authorId: v.id, body, clientKey: input.clientKey ?? null, files: { create: stored } } }),
      prisma.conversation.update({ where: { id }, data: { lastMessageAt: now, ...(c.status === "RESOLVED" && v.role !== "STAFF" ? { status: "OPEN", resolvedAt: null } : {}) } }),
      prisma.conversationParticipant.upsert({ where: { conversationId_userId: { conversationId: id, userId: v.id } }, create: { conversationId: id, userId: v.id, lastReadAt: now }, update: { lastReadAt: now } }),
    ]);
  } catch (e) {
    await removeStored(stored.map((s) => s.storageKey));
    if (isDuplicate(e) && (await byKey(v.id, input.clientKey))) return;
    throw e;
  }
  pushSafely(v, id);
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
  const roles = await prisma.user.findMany({ where: { id: { in: to }, blockedAt: null }, select: { id: true, role: true } });
  for (const r of roles) {
    // на экране блокировки — без текста и вложений (их могут увидеть посторонние); читать — в кабинете
    void sendPush([r.id], { title: "Новое сообщение", body: `От: ${from}`, url: `${base(r.role)}/${conversationId}`, tag: `msg-${conversationId}` }).catch(() => {});
  }
}

/** Пользователь из сессии → Viewer для проверок прав. */
export function viewerOf(user: { id: string; role: Role; student: { id: string; groupId: string; facultyId: string } | null; staff: { id: string; facultyId: string | null } | null; teacher: { id: string } | null }): Viewer {
  return { id: user.id, role: user.role, student: user.student, staff: user.staff, teacher: user.teacher };
}
