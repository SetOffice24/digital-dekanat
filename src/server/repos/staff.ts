import "server-only";
/**
 * Данные кабинета сотрудника. Каждая функция принимает `staff` из requireStaff().
 * Если у сотрудника задан факультет — он видит только свой факультет; иначе (деканат в целом) — всех.
 */
import { customAlphabet } from "nanoid";
import type { Prisma, RequestStatus, Staff } from "@prisma/client";
import { prisma } from "../db";
import { addDays, dueDate } from "@/lib/utils";
import { audienceUserIds, groupUserIds, notify } from "../notify";
import { requestStatusLabel } from "@/lib/labels";

export type SessionStaff = Pick<Staff, "id" | "userId" | "facultyId">;

const verifyCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

const studentScope = (s: SessionStaff): Prisma.StudentWhereInput => (s.facultyId ? { facultyId: s.facultyId } : {});
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

export type RequestFilters = { status?: RequestStatus; typeId?: string };

export function listRequests(staff: SessionStaff, f: RequestFilters) {
  return prisma.request.findMany({
    where: { student: studentScope(staff), ...(f.status ? { status: f.status } : {}), ...(f.typeId ? { typeId: f.typeId } : {}) },
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

export const STAFF_STATUSES: RequestStatus[] = ["IN_REVIEW", "NEED_INFO", "READY", "DONE", "REJECTED"];

export async function assignToMe(staff: SessionStaff, id: string) {
  const r = await prisma.request.findFirst({ where: { id, student: studentScope(staff) }, select: { id: true } });
  if (!r) return false;
  await prisma.request.update({ where: { id }, data: { assigneeId: staff.id } });
  return true;
}

/** Смена статуса: событие + (для справок в READY) выдача Certificate + уведомление студенту. */
export async function changeRequestStatus(staff: SessionStaff, id: string, status: RequestStatus, message: string | null) {
  const r = await prisma.request.findFirst({
    where: { id, student: studentScope(staff) },
    include: { type: true, student: { select: { userId: true } }, certificate: true },
  });
  if (!r) return null;

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id },
      data: {
        status,
        assigneeId: r.assigneeId ?? staff.id,
        events: { create: { fromStatus: r.status, toStatus: status, authorUserId: staff.userId, message } },
      },
    });
    if (status === "READY" && r.type.isCertificate && !r.certificate) {
      await tx.certificate.create({ data: { requestId: id, verifyCode: verifyCode(), validUntil: addDays(new Date(), 180) } });
    }
  });

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
    body: `Занятие ${ymd(l.date).split("-").reverse().join(".")} в ${l.startTime} перенесено на ${ymd(to.date).split("-").reverse().join(".")}, ${to.startTime}–${to.endTime}, ауд. ${to.room}. Причина: ${to.reason}`,
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
    body: `Занятие ${ymd(l.date).split("-").reverse().join(".")} в ${l.startTime} отменено. Причина: ${reason}`,
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
export async function countByStatus(staff: SessionStaff) {
  const rows = await prisma.request.groupBy({ by: ["status"], where: { student: studentScope(staff) }, _count: { _all: true } });
  const out: Partial<Record<RequestStatus, number>> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}