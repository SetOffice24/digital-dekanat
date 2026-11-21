import "server-only";
/**
 * Библиотека знаний. Кто что видит (решение команды — «по уровню автора»):
 * - деканат: сотрудник без факультета — на весь вуз или любой факультет; сотрудник факультета — только на свой (как с объявлениями);
 * - преподаватель — по своей дисциплине: всем своим группам по ней или одной группе;
 * - студент видит (и помощник отвечает ему) только то, что адресовано ему: весь вуз, его факультет,
 *   дисциплины его группы от тех преподавателей, которые её ведут.
 * Учитываются только пары текущего учебного периода (прежние группы преподавателя материал не получают).
 * Редактирует преподаватель только своё; деканат — то, что сам может опубликовать.
 */
import type { KnowledgeScope, Prisma, Student } from "@prisma/client";
import { prisma } from "../db";
import { chunkText, cleanText, confident, rankChunks, type Searchable } from "../knowledge/text";
import { removeStored } from "../files";
import { currentPeriod } from "./teacher";

export type KnowledgeViewer = Viewer;
type Viewer = {
  id: string;
  role: "STUDENT" | "TEACHER" | "STAFF";
  student: Pick<Student, "id" | "groupId" | "facultyId"> | null;
  teacher: { id: string } | null;
  staff: { id: string; facultyId: string | null } | null;
};

export class KnowledgeError extends Error {}

export const MAX_BODY = 200_000;

/** Условие «материал виден пользователю» (для студента — с учётом того, кто ведёт его дисциплины). */
export async function visibleWhere(u: Viewer): Promise<Prisma.KnowledgeDocWhereInput> {
  if (u.role === "STUDENT" && u.student) {
    const pairs = await prisma.lesson.findMany({ where: { groupId: u.student.groupId, ...currentPeriod() }, distinct: ["teacherId", "courseId"], select: { teacherId: true, courseId: true } });
    return {
      OR: [
        { scope: "UNIVERSITY" },
        { scope: "FACULTY", facultyId: u.student.facultyId },
        ...pairs.map((p) => ({ scope: "COURSE" as const, courseId: p.courseId, author: { teacher: { id: p.teacherId } }, OR: [{ groupId: null }, { groupId: u.student!.groupId }] })),
      ],
    };
  }
  if (u.role === "TEACHER") return { OR: [{ scope: "UNIVERSITY" }, { authorId: u.id }] };
  if (u.role === "STAFF" && u.staff) return u.staff.facultyId ? { OR: [{ scope: "UNIVERSITY" }, { scope: "FACULTY", facultyId: u.staff.facultyId }] } : { scope: { in: ["UNIVERSITY", "FACULTY"] } };
  return { id: "-" };
}

/** Может ли пользователь менять материал. */
export function canEdit(u: Viewer, d: { authorId: string; scope: KnowledgeScope; facultyId: string | null }) {
  if (u.role === "TEACHER") return d.authorId === u.id;
  if (u.role === "STAFF" && u.staff) return d.scope !== "COURSE" && (u.staff.facultyId ? d.scope === "FACULTY" && d.facultyId === u.staff.facultyId : true);
  return false;
}

const listSelect = {
  id: true, title: true, scope: true, facultyId: true, courseId: true, groupId: true, authorId: true, createdAt: true, updatedAt: true,
  faculty: { select: { shortName: true } },
  course: { select: { name: true } },
  author: { select: { staff: { select: { fullName: true } }, teacher: { select: { fullName: true } } } },
  attachment: { select: { id: true, name: true } },
  _count: { select: { chunks: true } },
} satisfies Prisma.KnowledgeDocSelect;

/** Материалы, которые видит пользователь (новые сверху). Для управления: mine — только редактируемые. */
export async function listDocs(u: Viewer, opts: { mine?: boolean; courseId?: string } = {}) {
  const where = await visibleWhere(u);
  const docs = await prisma.knowledgeDoc.findMany({ where: { AND: [where, opts.courseId ? { courseId: opts.courseId } : {}] }, select: listSelect, orderBy: { updatedAt: "desc" }, take: 200 });
  const withGroups = await groupNames(docs.map((d) => d.groupId));
  const out = docs.map((d) => ({ ...d, groupName: d.groupId ? withGroups.get(d.groupId) ?? null : null, editable: canEdit(u, d) }));
  return opts.mine ? out.filter((d) => d.editable) : out;
}
export type DocListItem = Awaited<ReturnType<typeof listDocs>>[number];

async function groupNames(ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const groups = await prisma.group.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  return new Map(groups.map((g) => [g.id, g.name]));
}

/** Один материал — только если виден пользователю (иначе null → 404). */
export async function getDoc(u: Viewer, id: string) {
  const where = await visibleWhere(u);
  const d = await prisma.knowledgeDoc.findFirst({ where: { AND: [{ id }, where] }, select: { ...listSelect, body: true } });
  if (!d) return null;
  const groups = await groupNames([d.groupId]);
  return { ...d, groupName: d.groupId ? groups.get(d.groupId) ?? null : null, editable: canEdit(u, d) };
}

/** Что преподаватель может выбрать адресатом: свои дисциплины и группы по ним. */
export async function teacherTargets(teacherId: string) {
  const rows = await prisma.lesson.findMany({ where: { teacherId, ...currentPeriod() }, distinct: ["courseId", "groupId"], select: { course: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } } });
  const map = new Map<string, { id: string; name: string; groups: { id: string; name: string }[] }>();
  for (const r of rows) {
    const c = map.get(r.course.id) ?? { id: r.course.id, name: r.course.name, groups: [] };
    c.groups.push(r.group);
    map.set(r.course.id, c);
  }
  return [...map.values()].map((c) => ({ ...c, groups: c.groups.sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => a.name.localeCompare(b.name));
}

export type DocInput = { title: string; body: string; scope: KnowledgeScope; facultyId?: string | null; courseId?: string | null; groupId?: string | null };

/** Проверка адресата по роли автора; возвращает нормализованные поля. */
async function checkTarget(u: Viewer, i: DocInput) {
  if (u.role === "TEACHER" && u.teacher) {
    if (i.scope !== "COURSE" || !i.courseId) throw new KnowledgeError("Выберите дисциплину");
    const teaches = await prisma.lesson.count({ where: { teacherId: u.teacher.id, courseId: i.courseId, ...(i.groupId ? { groupId: i.groupId } : {}), ...currentPeriod() } });
    if (!teaches) throw new KnowledgeError("Можно публиковать только по своим дисциплинам и группам");
    return { scope: "COURSE" as const, facultyId: null, courseId: i.courseId, groupId: i.groupId || null };
  }
  if (u.role === "STAFF" && u.staff) {
    if (i.scope === "UNIVERSITY") {
      if (u.staff.facultyId) throw new KnowledgeError("Сотрудник факультета публикует только для своего факультета");
      return { scope: "UNIVERSITY" as const, facultyId: null, courseId: null, groupId: null };
    }
    if (i.scope === "FACULTY") {
      const facultyId = u.staff.facultyId ?? i.facultyId;
      if (!facultyId || !(await prisma.faculty.count({ where: { id: facultyId } }))) throw new KnowledgeError("Выберите факультет");
      return { scope: "FACULTY" as const, facultyId, courseId: null, groupId: null };
    }
    throw new KnowledgeError("Деканат публикует на весь вуз или на факультет");
  }
  throw new KnowledgeError("Нет прав на публикацию");
}

function normalize(i: DocInput) {
  const title = i.title.replace(/\s+/g, " ").trim().slice(0, 160);
  const body = cleanText(i.body).slice(0, MAX_BODY);
  if (title.length < 3) throw new KnowledgeError("Название — от 3 символов");
  if (body.length < 20) throw new KnowledgeError("Текст слишком короткий");
  return { title, body };
}

const chunkRows = (body: string) => chunkText(body).map((c) => ({ idx: c.idx, heading: c.heading, text: c.text }));

export async function createDoc(u: Viewer, i: DocInput, file?: { name: string; mime: string; size: number; storageKey: string }) {
  const { title, body } = normalize(i);
  const target = await checkTarget(u, i);
  return prisma.$transaction(async (tx) => {
    const att = file ? await tx.attachment.create({ data: { ...file, uploadedById: u.id } }) : null;
    return tx.knowledgeDoc.create({ data: { title, body, ...target, authorId: u.id, attachmentId: att?.id, chunks: { create: chunkRows(body) } }, select: { id: true } });
  });
}

/** Изменить материал (текст пересобирается во фрагменты). Чужой / недоступный → null. */
export async function updateDoc(u: Viewer, id: string, i: DocInput) {
  const d = await prisma.knowledgeDoc.findUnique({ where: { id }, select: { authorId: true, scope: true, facultyId: true } });
  if (!d || !canEdit(u, d)) return null;
  const { title, body } = normalize(i);
  const target = await checkTarget(u, i);
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { docId: id } }),
    prisma.knowledgeDoc.update({ where: { id }, data: { title, body, ...target, chunks: { create: chunkRows(body) } } }),
  ]);
  return true;
}

export async function deleteDoc(u: Viewer, id: string) {
  const d = await prisma.knowledgeDoc.findUnique({ where: { id }, select: { authorId: true, scope: true, facultyId: true, attachment: { select: { id: true, storageKey: true } } } });
  if (!d || !canEdit(u, d)) return false;
  await prisma.knowledgeDoc.delete({ where: { id } });
  if (d.attachment) {
    await prisma.attachment.delete({ where: { id: d.attachment.id } }).catch(() => {});
    await removeStored([d.attachment.storageKey]);
  }
  return true;
}

/** Виден ли пользователю материал с этим вложением (для скачивания исходного файла). */
export async function canSeeAttachmentDoc(u: Viewer, attachmentId: string) {
  const where = await visibleWhere(u);
  return (await prisma.knowledgeDoc.count({ where: { AND: [{ attachmentId }, where] } })) > 0;
}

/* ---------------- Поиск для помощника ---------------- */

export type KnowledgeHit = { docId: string; title: string; heading: string | null; excerpt: string; text: string; score: number; coverage: number };

/** Лучшие фрагменты библиотеки по вопросу — только из видимых пользователю материалов. */
export async function searchKnowledge(u: Viewer, query: string, limit = 4): Promise<KnowledgeHit[]> {
  const where = await visibleWhere(u);
  const chunks = await prisma.knowledgeChunk.findMany({ where: { doc: where }, select: { id: true, docId: true, heading: true, text: true, doc: { select: { title: true } } }, take: 5000 });
  const items: Searchable[] = chunks.map((c) => ({ id: c.id, docId: c.docId, title: c.doc.title, heading: c.heading, text: c.text }));
  return rankChunks(query, items, limit).map((h) => ({ docId: h.chunk.docId, title: h.chunk.title, heading: h.chunk.heading, excerpt: h.excerpt, text: h.chunk.text, score: h.score, coverage: h.coverage }));
}

/** Уверенные совпадения (для ответа без нейросети). */
export async function confidentHits(u: Viewer, query: string, limit = 2) {
  const hits = await searchKnowledge(u, query, 4);
  return hits.filter((h) => confident(h, query)).slice(0, limit);
}

/** Новые материалы для студента за последние дни — для утренних подсказок помощника. */
export async function freshDocsFor(u: Viewer, since: Date) {
  const where = await visibleWhere(u);
  return prisma.knowledgeDoc.findMany({ where: { AND: [where, { createdAt: { gte: since } }] }, select: { id: true, title: true, course: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 });
}
