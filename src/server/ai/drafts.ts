import "server-only";
import { prisma } from "../db";
import { parseFields, type FieldDef } from "@/lib/request-fields";
import { currentPeriod } from "../repos/teacher";
import { ACCEPT, MAX_FILE_MB, MAX_FILES } from "../files";
import { fmtDateTime, fmtDay } from "@/lib/utils";
import { bells } from "@/config/university";

const fmtShortDay = (d: Date) => fmtDay(d);

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

/** Студент: сдать домашнее задание (только не принятые задания своей группы). Файлы — в карточке. */
export type SubmissionCard = {
  kind: "SUBMISSION";
  options: { id: string; title: string; course: string; due: string; state: string }[];
  assignmentId: string;
  accept: string;
  maxFiles: number;
  maxMb: number;
  done?: { href: string; title: string };
};

/** Преподаватель: сообщение студенту (личный диалог) или напоминание группе (уведомление). Только свои группы. */
export type MessageCard = {
  kind: "MESSAGE";
  students: { userId: string; name: string; group: string }[];
  groups: { id: string; name: string }[];
  values: { mode: "STUDENT" | "GROUP"; studentUserId: string; groupId: string; subject: string; body: string };
  done?: { href?: string; sentTo?: number };
};

/** Деканат: перенос пары группы своей области. */
export type MoveCard = {
  kind: "MOVE";
  lessons: { id: string; label: string }[];
  bells: { value: string; label: string }[];
  values: { lessonId: string; date: string; bell: string; room: string; reason: string };
  done?: { text: string };
};

export type DraftCard = RequestCard | AssignmentCard | AnnouncementCard | SubmissionCard | MessageCard | MoveCard;

type Owner = { role: "STUDENT" | "TEACHER" | "STAFF"; student?: { id: string; groupId: string } | null; teacher?: { id: string } | null; staff?: { facultyId: string | null } | null };
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

  if (d.kind === "MESSAGE" && user.role === "TEACHER" && user.teacher) {
    const lessons = await prisma.lesson.findMany({ where: { teacherId: user.teacher.id, ...currentPeriod() }, distinct: ["groupId"], select: { group: { select: { id: true, name: true } } } });
    const groups = lessons.map((l) => l.group).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const st = await prisma.student.findMany({ where: { groupId: { in: groups.map((g) => g.id) } }, orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }], select: { userId: true, lastName: true, firstName: true, group: { select: { name: true } } } });
    const students = st.map((s) => ({ userId: s.userId, name: `${s.lastName} ${s.firstName}`, group: s.group.name }));
    return {
      kind: "MESSAGE",
      students,
      groups,
      values: {
        mode: d.mode === "STUDENT" ? "STUDENT" : "GROUP",
        studentUserId: students.some((s) => s.userId === d.studentUserId) ? String(d.studentUserId) : "",
        groupId: groups.some((g) => g.id === d.groupId) ? String(d.groupId) : "",
        subject: String(d.subject ?? ""),
        body: String(d.body ?? ""),
      },
      done: typeof d.conversationId === "string" ? { href: `/teacher/messages/${d.conversationId}` } : typeof d.sentTo === "string" ? { sentTo: Number(d.sentTo) } : undefined,
    };
  }

  if (d.kind === "MOVE" && user.role === "STAFF" && user.staff) {
    const fac = user.staff.facultyId;
    const today = new Date(new Date().toISOString().slice(0, 10));
    const groupId = typeof d.groupId === "string" ? d.groupId : "";
    const rows = groupId
      ? await prisma.lesson.findMany({
          where: { groupId, status: { not: "CANCELLED" }, date: { gte: today }, ...(fac ? { group: { program: { facultyId: fac } } } : {}) },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 30,
          select: { id: true, date: true, startTime: true, subgroup: true, room: true, course: { select: { name: true } } },
        })
      : [];
    const lessons = rows.map((l) => ({ id: l.id, label: `${fmtShortDay(l.date)}, ${l.startTime} — ${l.course.name}${l.subgroup ? ` (${l.subgroup} подгр.)` : ""}, ауд. ${l.room}` }));
    return {
      kind: "MOVE",
      lessons,
      bells: bells.map((b) => ({ value: `${b.start}|${b.end}`, label: `${b.n} пара · ${b.start}–${b.end}` })),
      values: {
        // не нашли однозначно — пусто, сотрудник выбирает сам (не подставляем первую попавшуюся пару)
        lessonId: lessons.some((l) => l.id === d.lessonId) ? String(d.lessonId) : "",
        date: typeof d.date === "string" ? d.date : "",
        bell: bells.some((b) => `${b.start}|${b.end}` === d.bell) ? String(d.bell) : "",
        room: String(d.room ?? ""),
        reason: String(d.reason ?? ""),
      },
      done: typeof d.movedText === "string" ? { text: d.movedText } : undefined,
    };
  }

  if (d.kind === "SUBMISSION" && user.role === "STUDENT" && user.student) {
    const s = user.student;
    const rows = await prisma.assignment.findMany({
      where: { groupId: s.groupId },
      orderBy: { dueAt: "asc" },
      select: { id: true, title: true, dueAt: true, course: { select: { name: true } }, submissions: { where: { studentId: s.id }, select: { status: true } } },
    });
    const now = new Date();
    const state = (r: (typeof rows)[number]) => r.submissions[0]?.status ?? (r.dueAt < now ? "OVERDUE" : "TODO");
    const label: Record<string, string> = { TODO: "не сдано", OVERDUE: "просрочено", SUBMITTED: "на проверке", RETURNED: "на доработке" };
    const options = rows.filter((r) => state(r) !== "ACCEPTED").map((r) => ({ id: r.id, title: r.title, course: r.course.name, due: fmtDateTime(r.dueAt), state: label[state(r)] ?? "" }));
    const sent = typeof d.sentAssignmentId === "string" ? rows.find((r) => r.id === d.sentAssignmentId) : undefined;
    return {
      kind: "SUBMISSION",
      options,
      assignmentId: options.some((o) => o.id === d.assignmentId) ? String(d.assignmentId) : (options[0]?.id ?? ""),
      accept: ACCEPT,
      maxFiles: MAX_FILES,
      maxMb: MAX_FILE_MB,
      done: sent ? { href: `/homework/${sent.id}`, title: sent.title } : undefined,
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
