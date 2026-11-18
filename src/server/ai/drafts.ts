import "server-only";
import { prisma } from "../db";
import { parseFields, type FieldDef } from "@/lib/request-fields";
import { currentPeriod } from "../repos/teacher";

/**
 * Карточка действия в чате помощника: ИИ распознал, что нужно сделать, и заполнил что понял.
 * Клиент показывает поля (недостающее — заполнить на месте) и кнопку действия.
 * Само действие выполняется только по нажатию человека — теми же функциями, что и обычные формы.
 */
export type RequestCard = {
  kind: "REQUEST";
  typeCode: string;
  title: string;
  /** справки заказываются в один клик; заявления — через полную форму */
  oneClick: boolean;
  needsPaper: boolean;
  slaDays: number;
  fields: FieldDef[];
  values: Record<string, string>;
  requestId?: string;
  requestNumber?: number;
};

/** Преподаватель: выдать домашнее задание (группа и дисциплина — только из его текущих пар). */
export type AssignmentCard = {
  kind: "ASSIGNMENT";
  pairs: { groupId: string; groupName: string; courseId: string; courseName: string }[];
  values: { pair: string; title: string; description: string; dueAt: string };
  done?: { href: string; title: string };
};

/** Деканат: объявление студентам (группа — только из области сотрудника). */
export type AnnouncementCard = {
  kind: "ANNOUNCEMENT";
  groups: { id: string; name: string }[];
  canAll: boolean;
  facultyName: string | null;
  values: { audience: "ALL" | "FACULTY" | "GROUP"; groupId: string; title: string; body: string };
  done?: { sentTo: number };
};

export type DraftCard = RequestCard | AssignmentCard | AnnouncementCard;

type Owner = { role: "STUDENT" | "TEACHER" | "STAFF"; teacher?: { id: string } | null; staff?: { facultyId: string | null } | null };
type Stored = Record<string, unknown> | null;

export async function describeDraft(raw: unknown, user: Owner): Promise<DraftCard | null> {
  const d = raw as Stored;
  if (!d) return null;

  if (d.kind === "ASSIGNMENT" && user.role === "TEACHER" && user.teacher) {
    const rows = await prisma.lesson.findMany({ where: { teacherId: user.teacher.id, ...currentPeriod() }, distinct: ["groupId", "courseId"], select: { group: { select: { id: true, name: true } }, course: { select: { id: true, name: true } } } });
    const pairs = rows.map((p) => ({ groupId: p.group.id, groupName: p.group.name, courseId: p.course.id, courseName: p.course.name })).sort((a, b) => a.groupName.localeCompare(b.groupName, "ru") || a.courseName.localeCompare(b.courseName, "ru"));
    const pair = `${d.groupId ?? ""}|${d.courseId ?? ""}`;
    const doneId = typeof d.assignmentId === "string" ? d.assignmentId : null;
    const done = doneId ? await prisma.assignment.findFirst({ where: { id: doneId, teacherId: user.teacher.id }, select: { id: true, title: true, groupId: true, courseId: true } }) : null;
    return {
      kind: "ASSIGNMENT",
      pairs,
      values: { pair: pairs.some((p) => `${p.groupId}|${p.courseId}` === pair) ? pair : "", title: String(d.title ?? ""), description: String(d.description ?? ""), dueAt: String(d.dueAt ?? "") },
      done: done ? { href: `/teacher/${done.groupId}/${done.courseId}/homework/${done.id}`, title: done.title } : undefined,
    };
  }

  if (d.kind === "ANNOUNCEMENT" && user.role === "STAFF" && user.staff) {
    const fac = user.staff.facultyId;
    const [groups, faculty] = await Promise.all([
      prisma.group.findMany({ where: fac ? { program: { facultyId: fac } } : {}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      fac ? prisma.faculty.findUnique({ where: { id: fac }, select: { shortName: true } }) : null,
    ]);
    const aud = d.audience === "GROUP" || d.audience === "FACULTY" || d.audience === "ALL" ? d.audience : "GROUP";
    return {
      kind: "ANNOUNCEMENT",
      groups,
      canAll: !fac,
      facultyName: faculty?.shortName ?? null,
      values: { audience: aud === "ALL" && fac ? "FACULTY" : aud === "FACULTY" && !fac ? "ALL" : aud, groupId: groups.some((g) => g.id === d.groupId) ? String(d.groupId) : "", title: String(d.title ?? ""), body: String(d.body ?? "") },
      done: typeof d.sentTo === "string" ? { sentTo: Number(d.sentTo) } : undefined,
    };
  }

  // студент: черновик заявки (исторический формат без kind)
  if (user.role !== "STUDENT" || typeof d.typeCode !== "string") return null;
  const type = await prisma.requestType.findUnique({ where: { code: d.typeCode } });
  if (!type) return null;
  const fields = parseFields(type.fields);
  const payload = (d.payload ?? {}) as Record<string, string>;
  const req = typeof d.requestId === "string" ? await prisma.request.findUnique({ where: { id: d.requestId }, select: { id: true, number: true } }) : null;
  return {
    kind: "REQUEST",
    typeCode: type.code,
    title: type.title,
    oneClick: type.isCertificate,
    needsPaper: type.needsPaper,
    slaDays: type.slaDays,
    fields,
    values: Object.fromEntries(fields.map((f) => [f.name, String(payload?.[f.name] ?? "")])),
    requestId: req?.id,
    requestNumber: req?.number,
  };
}
