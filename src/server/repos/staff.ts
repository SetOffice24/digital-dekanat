import "server-only";
/**
 * Данные кабинета сотрудника. Каждая функция принимает `staff` из requireStaff().
 * Если у сотрудника задан факультет — он видит только свой факультет; иначе (деканат в целом) — всех.
 */
import { customAlphabet } from "nanoid";
import type { Prisma, RequestStatus, Staff } from "@prisma/client";
import { prisma } from "../db";
import { addDays, dueDate, fmtShort, fmtWeekdayShort, roomLabel } from "@/lib/utils";

// «пн, 16 нояб» — коротко и однозначно для уведомлений
const dayShort = (d: Date) => `${fmtWeekdayShort(d)}, ${fmtShort(d)}`;
import { audienceUserIds, groupUserIds, notify } from "../notify";
import { requestStatusLabel } from "@/lib/labels";

export type SessionStaff = Pick<Staff, "id" | "userId" | "facultyId">;

const verifyCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

export const studentScope = (s: SessionStaff): Prisma.StudentWhereInput => (s.facultyId ? { facultyId: s.facultyId } : {});
const groupScope = (s: SessionStaff): Prisma.GroupWhereInput => (s.facultyId ? { program: { facultyId: s.facultyId } } : {});

const OPEN: RequestStatus[] = ["NEW", "IN_REVIEW", "NEED_INFO"];

/* ---------- заявки ---------- */
const listInclude = {
  type: { select: { title: true, code: true, slaDays: true, isCertificate: true } },
  student: { select: { lastName: true, firstName: true, middleName: true, group: { select: { name: true } } } },
  assignee: { select: { fullName: true } },
} satisfies Prisma.RequestInclude;

export type StaffRequestRow = Prisma.RequestGetPayload<{ include: typeof listInclude }>;

export function isOverdue(r: { status: RequestStatus; createdAt: Date; type: { slaDays: number } }, now = new Date()) {
  // «Ждём ответа студента» не считается просрочкой деканата
  return (r.status === "NEW" || r.status === "IN_REVIEW") && dueDate(r.createdAt, r.type.slaDays).getTime() < now.getTime();
}

export async function getDashboard(staff: SessionStaff) {
  const where: Prisma.RequestWhereInput = { student: studentScope(staff) };
  const [newCount, needInfoCount, open, recent] = await Promise.all([
    prisma.request.count({ where: { ...where, status: "NEW" } }),
    prisma.request.count({ where: { ...where, status: "NEED_INFO" } }),
    prisma.request.findMany({ where: { ...where, status: { in: OPEN } }, select: { status: true, createdAt: true, type: { select: { slaDays: true } } } }),
    prisma.request.findMany({ where, include: listInclude, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const now = new Date();
  return { newCount, needInfoCount, overdueCount: open.filter((r) => isOverdue(r, now)).length, recent };
}

export type RequestFilters = { status?: RequestStatus; typeId?: string; q?: string };

/**
 * Написания одного слова: как ввели, «Озёров», «ОЗЁРОВ» (группы), «е» → «ё».
 * Не полагаемся на регистронезависимость БД: при локали C Postgres не сравнивает кириллицу без учёта регистра.
 */
export function variants(w: string) {
  const lower = w.toLowerCase();
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  const out = new Set([w, lower, cap, w.toUpperCase()]);
  if (/е/i.test(w)) for (const v of [...out]) out.add(v.replace(/е/g, "ё").replace(/Е/g, "Ё"));
  return [...out];
}

/** Поиск: фамилия/имя студента, группа или номер заявки (можно с «№»). Всегда внутри области видимости сотрудника. */
function searchWhere(staff: SessionStaff, f: Omit<RequestFilters, "status">): Prisma.RequestWhereInput {
  const q = f.q?.trim().replace(/^№\s*/, "").slice(0, 60);
  const words = q ? q.split(/\s+/).filter(Boolean).slice(0, 3) : [];
  return {
    student: studentScope(staff),
    ...(f.typeId ? { typeId: f.typeId } : {}),
    ...(words.length
      ? {
          AND: words.map((w) => ({
            OR: [
              ...(/^\d{1,7}$/.test(w) ? [{ number: Number(w) }] : []),
              ...variants(w).flatMap((v) => [
                { student: { lastName: { contains: v, mode: "insensitive" as const } } },
                { student: { firstName: { contains: v, mode: "insensitive" as const } } },
                { student: { group: { name: { contains: v, mode: "insensitive" as const } } } },
              ]),
            ],
          })),
        }
      : {}),
  };
}

export function listRequests(staff: SessionStaff, f: RequestFilters) {
  return prisma.request.findMany({
    where: { ...searchWhere(staff, f), ...(f.status ? { status: f.status } : {}) },
    include: listInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export function listTypes() {
  return prisma.requestType.findMany({ select: { id: true, title: true }, orderBy: [{ category: "desc" }, { title: "asc" }] });
}

export function getRequest(staff: SessionStaff, id: string) {
  return prisma.request.findFirst({
    where: { id, student: studentScope(staff) },
    include: {
      type: true,
      certificate: true,
      assignee: { select: { id: true, fullName: true } },
      student: { include: { faculty: true, program: true, group: true } },
      events: { orderBy: { createdAt: "asc" }, include: { author: { select: { role: true, staff: { select: { fullName: true } } } } } },
    },
  });
}

/** Следующая заявка, которая ждёт деканат (новые и в работе, самые старые — первыми). Для кнопки «Следующая». */
export function nextOpenRequest(staff: SessionStaff, excludeId: string) {
  return prisma.request.findFirst({
    where: { id: { not: excludeId }, student: studentScope(staff), status: { in: ["NEW", "IN_REVIEW"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: { id: true, number: true, type: { select: { title: true } } },
  });
}

export const STAFF_STATUSES: RequestStatus[] = ["IN_REVIEW", "NEED_INFO", "READY", "DONE", "REJECTED"];

export async function assignToMe(staff: SessionStaff, id: string) {
  const r = await prisma.request.findFirst({ where: { id, student: studentScope(staff) }, select: { id: true } });
  if (!r) return false;
  await prisma.request.update({ where: { id }, data: { assigneeId: staff.id } });
  return true;
}

/** Смена статуса: событие + (для справок в READY) выдача Certificate + уведомление студенту. */
/** Допустимые переходы статуса заявки (те же, что кнопки в карточке). «Выдана» и «Отклонена» — конечные. */
export const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  NEW: ["IN_REVIEW", "NEED_INFO", "REJECTED"],
  IN_REVIEW: ["READY", "DONE", "NEED_INFO", "REJECTED"],
  NEED_INFO: ["IN_REVIEW", "REJECTED"],
  READY: ["DONE"],
  DONE: [],
  REJECTED: [],
};

/** Сменить статус. null — заявки нет или она вне области сотрудника; "invalid" — такой переход запрещён или статус уже сменили. */
export async function changeRequestStatus(staff: SessionStaff, id: string, status: RequestStatus, message: string | null) {
  const r = await prisma.request.findFirst({
    where: { id, student: studentScope(staff) },
    include: { type: true, student: { select: { userId: true } }, certificate: true },
  });
  if (!r) return null;
  if (!REQUEST_TRANSITIONS[r.status].includes(status)) return "invalid" as const;

  const changed = await prisma.$transaction(async (tx) => {
    // условие на прежний статус: два сотрудника одновременно не проведут заявку двумя разными путями
    const { count } = await tx.request.updateMany({ where: { id, status: r.status }, data: { status, assigneeId: r.assigneeId ?? staff.id } });
    if (!count) return false;
    await tx.requestEvent.create({ data: { requestId: id, fromStatus: r.status, toStatus: status, authorUserId: staff.userId, message } });
    if (status === "READY" && r.type.isCertificate && !r.certificate) {
      await tx.certificate.create({ data: { requestId: id, verifyCode: verifyCode(), validUntil: addDays(new Date(), 180) } });
    }
    return true;
  });
  if (!changed) return "invalid" as const;

  await notify([r.student.userId], {
    kind: "REQUEST_STATUS",
    title: `${r.type.title}: ${requestStatusLabel[status].toLowerCase()}`,
    body: `Заявка «${r.type.title}» № ${r.number} — новый статус «${requestStatusLabel[status]}».${message ? ` Комментарий: ${message}` : ""}`,
    link: `/requests/${id}`,
  });
  return r;
}

/* ---------- объявления ---------- */
export function listAnnouncements(staff: SessionStaff) {
  return prisma.announcement.findMany({
    where: staff.facultyId ? { OR: [{ audience: "ALL" }, { facultyId: staff.facultyId }, { group: { program: { facultyId: staff.facultyId } } }] } : {},
    include: { author: { select: { fullName: true } }, faculty: { select: { shortName: true } }, group: { select: { name: true } } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
  });
}

export function listFaculties(staff: SessionStaff) {
  return prisma.faculty.findMany({ where: staff.facultyId ? { id: staff.facultyId } : {}, select: { id: true, name: true, shortName: true }, orderBy: { name: "asc" } });
}

export function listGroups(staff: SessionStaff) {
  return prisma.group.findMany({ where: groupScope(staff), select: { id: true, name: true, course: true }, orderBy: { name: "asc" } });
}

export type NewAnnouncement = { title: string; body: string; audience: "ALL" | "FACULTY" | "GROUP"; facultyId?: string | null; groupId?: string | null; pinned: boolean };

/** Возвращает число адресатов или null, если аудитория вне доступа сотрудника. */
export async function createAnnouncement(staff: SessionStaff, a: NewAnnouncement) {
  if (staff.facultyId && a.audience === "ALL") return null;
  if (a.audience === "FACULTY" && (!a.facultyId || (staff.facultyId && a.facultyId !== staff.facultyId))) return null;
  if (a.audience === "GROUP") {
    const g = a.groupId ? await prisma.group.findFirst({ where: { id: a.groupId, ...groupScope(staff) }, select: { id: true } }) : null;
    if (!g) return null;
  }
  const facultyId = a.audience === "FACULTY" ? a.facultyId! : null;
  const groupId = a.audience === "GROUP" ? a.groupId! : null;
  const ann = await prisma.announcement.create({
    data: { title: a.title, body: a.body, audience: a.audience, facultyId, groupId, pinned: a.pinned, authorStaffId: staff.id },
  });
  const ids = await audienceUserIds({ audience: a.audience, facultyId, groupId });
  await notify(ids, {
    kind: "ANNOUNCEMENT",
    title: a.title,
    body: a.body.length > 140 ? a.body.slice(0, 137) + "…" : a.body,
    link: "/",
    dedupeKey: `announcement:${ann.id}`,
  });
  return ids.length;
}

/* ---------- расписание ---------- */
export async function listLessons(staff: SessionStaff, groupId: string, date: Date) {
  const g = await prisma.group.findFirst({ where: { id: groupId, ...groupScope(staff) }, select: { id: true } });
  if (!g) return [];
  return prisma.lesson.findMany({
    where: { groupId, date },
    include: { course: true, teacher: true },
    orderBy: { startTime: "asc" },
  });
}

async function ownLesson(staff: SessionStaff, id: string) {
  return prisma.lesson.findFirst({ where: { id, group: groupScope(staff) }, include: { course: true } });
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function moveLesson(
  staff: SessionStaff,
  id: string,
  to: { date: Date; startTime: string; endTime: string; room: string; reason: string },
) {
  const l = await ownLesson(staff, id);
  if (!l || l.status === "CANCELLED") return null;
  await prisma.lesson.update({
    where: { id },
    data: {
      status: "MOVED",
      // исходные дата/время сохраняем только при первом переносе
      movedFromDate: l.status === "MOVED" ? l.movedFromDate : l.date,
      movedFromTime: l.status === "MOVED" ? l.movedFromTime : l.startTime,
      date: to.date,
      startTime: to.startTime,
      endTime: to.endTime,
      room: to.room,
      changeNote: to.reason,
      changedAt: new Date(),
    },
  });
  const ids = await groupUserIds(l.groupId, l.subgroup);
  await notify(ids, {
    kind: "SCHEDULE_CHANGE",
    title: `Перенос: ${l.course.name}`,
    body: `Пара ${dayShort(l.date)} в ${l.startTime} перенесена на ${dayShort(to.date)}, ${to.startTime}–${to.endTime}, ${roomLabel(to.room)}. Причина: ${to.reason}`,
    link: `/schedule?date=${ymd(to.date)}`,
  });
  return l;
}

export async function cancelLesson(staff: SessionStaff, id: string, reason: string) {
  const l = await ownLesson(staff, id);
  if (!l || l.status === "CANCELLED") return null;
  await prisma.lesson.update({ where: { id }, data: { status: "CANCELLED", changeNote: reason, changedAt: new Date() } });
  const ids = await groupUserIds(l.groupId, l.subgroup);
  await notify(ids, {
    kind: "SCHEDULE_CHANGE",
    title: `Отмена: ${l.course.name}`,
    body: `Пара ${dayShort(l.date)} в ${l.startTime} отменена. Причина: ${reason}`,
    link: `/schedule?date=${ymd(l.date)}`,
  });
  return l;
}

/* ---------- справки ---------- */
export function getCertificateForStaff(staff: SessionStaff, requestId: string) {
  return prisma.certificate.findFirst({
    where: { requestId, revoked: false, request: { student: studentScope(staff) } },
    include: { request: { include: { type: true, student: { include: { faculty: true, program: true, group: true } } } } },
  });
}

/** Количество заявок по статусам — для вкладок «входящих». */
export async function countByStatus(staff: SessionStaff, f: Omit<RequestFilters, "status"> = {}) {
  const rows = await prisma.request.groupBy({ by: ["status"], where: searchWhere(staff, f), _count: { _all: true } });
  const out: Partial<Record<RequestStatus, number>> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}
/** Данные для черновика справки (до «Справка готова»): только справки, только в области видимости сотрудника. */
export async function getCertificatePreview(staff: SessionStaff, requestId: string) {
  const r = await prisma.request.findFirst({
    where: { id: requestId, type: { isCertificate: true }, student: studentScope(staff) },
    include: { type: true, student: { include: { faculty: true, program: true, group: true } } },
  });
  if (!r) return null;
  const now = new Date();
  return { verifyCode: "ОБРАЗЕЦ", issuedAt: now, validUntil: addDays(now, 180), request: r };
}

/** Пропуски студента за период — для заявления об уважительной причине. Только студенты в области видимости. */
export function absencesInRange(staff: SessionStaff, studentId: string, from: Date, to: Date) {
  return prisma.attendance.findMany({
    where: { present: false, student: { id: studentId, ...studentScope(staff) }, lesson: { date: { gte: from, lte: to } } },
    orderBy: [{ lesson: { date: "asc" } }, { lesson: { startTime: "asc" } }],
    select: { lesson: { select: { date: true, startTime: true, course: { select: { name: true } } } } },
  });
}
