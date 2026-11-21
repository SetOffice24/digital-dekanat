import "server-only";
/**
 * Жизненные ситуации: план шагов в деканате и у преподавателей, состояние каждого шага — по данным:
 * заявка подана (и её статус), документ загружен, записан на приём, фото принято, уведомления включены.
 * Вручную отмечаются только «прочитал» и «предупредил преподавателей» (последнее ещё и рассылает уведомление).
 */
import type { RequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { notify } from "../notify";
import { currentPeriod } from "../repos/teacher";
import { isUsable } from "./documents";
import { situationByCode, situations, type Situation, type SituationStep } from "@/config/situations";
import { deanery, docKinds } from "@/config/services";
import { requestStatusLabel } from "@/lib/labels";
import { fmtDateTime } from "@/lib/utils";

type CaseStudent = { id: string; userId: string; groupId: string; subgroup: number; lastName?: string; firstName?: string };
export class CaseError extends Error {}

export type StepState = {
  key: string;
  title: string;
  hint: string;
  kind: SituationStep["kind"];
  optional: boolean;
  done: boolean;
  /** что показать справа: статус заявки, «загружен», время приёма */
  status: string | null;
  /** куда вести кнопку шага */
  href: string | null;
  action: string;
};

export async function listCases(studentId: string) {
  return prisma.situationCase.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, code: true, status: true, createdAt: true, closedAt: true } });
}

/** Начать ситуацию (одна открытая на код — повторный старт открывает существующую). */
export async function startCase(s: CaseStudent, code: string) {
  if (!situationByCode(code)) throw new CaseError("Неизвестная ситуация");
  const open = await prisma.situationCase.findFirst({ where: { studentId: s.id, code, status: "OPEN" }, select: { id: true } });
  if (open) return open;
  return prisma.situationCase.create({ data: { studentId: s.id, code }, select: { id: true } });
}

const DONE_STATUSES: RequestStatus[] = ["NEW", "IN_REVIEW", "NEED_INFO", "READY", "DONE"];

/** Ситуация со вычисленными шагами. Чужая → null. */
export async function getCase(s: CaseStudent, caseId: string) {
  const c = await prisma.situationCase.findFirst({
    where: { id: caseId, studentId: s.id },
    include: { steps: true, requests: { select: { id: true, number: true, status: true, type: { select: { code: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!c) return null;
  const sit = situationByCode(c.code);
  if (!sit) return null;
  const [docs, appts, photo, push] = await Promise.all([
    prisma.studentDocument.findMany({ where: { studentId: s.id }, orderBy: { createdAt: "desc" }, select: { kind: true, status: true, validUntil: true } }),
    // приём засчитывается шагу, только если он относится к этому делу: записан из заявки дела или по ссылке шага (та же цель)
    prisma.appointment.findMany({ where: { studentId: s.id, status: { in: ["BOOKED", "DONE"] }, createdAt: { gte: c.createdAt } }, orderBy: { startsAt: "desc" }, select: { startsAt: true, status: true, purpose: true, requestId: true } }),
    prisma.studentPhoto.findFirst({ where: { studentId: s.id, status: { in: ["APPROVED", "PENDING"] } }, select: { status: true } }),
    prisma.pushSubscription.count({ where: { userId: s.userId } }),
  ]);
  const manual = new Map(c.steps.map((x) => [x.key, x]));

  const steps: StepState[] = sit.steps.map((st) => {
    const base = { key: st.key, title: st.title, hint: st.hint, kind: st.kind, optional: Boolean(st.optional) };
    switch (st.kind) {
      case "request": {
        const r = c.requests.find((x) => x.type.code === st.typeCode && DONE_STATUSES.includes(x.status));
        // шаг студента выполнен, когда заявка подана; результат вуза — отдельно в подписи («подано» / «готово»)
        return { ...base, done: Boolean(r), status: r ? `№${r.number} · ${r.status === "READY" || r.status === "DONE" ? "деканат выполнил" : `подано, ${requestStatusLabel[r.status].toLowerCase()}`}` : null, href: r ? `/requests/${r.id}` : `/requests/new?type=${st.typeCode}&case=${c.id}`, action: r ? "Открыть" : "Подать" };
      }
      case "doc": {
        const d = docs.find((x) => x.kind === st.docKind && isUsable(x));
        return { ...base, done: Boolean(d), status: d ? (d.status === "VERIFIED" ? "проверен" : "загружен") : null, href: `/services/documents?kind=${st.docKind}&back=/services/case/${c.id}`, action: d ? "Посмотреть" : "Загрузить" };
      }
      case "appointment": {
        const caseRequests = new Set(c.requests.map((r) => r.id));
        const a = appts.find((x) => (x.requestId && caseRequests.has(x.requestId)) || x.purpose === st.purpose);
        // запись — это действие студента; «были на приёме» — отметка деканата. Получение документа запись не подтверждает.
        const status = a ? (a.status === "DONE" ? `были на приёме ${fmtDateTime(a.startsAt)}` : `записаны: ${deanery.name}, ${fmtDateTime(a.startsAt)}`) : null;
        const req = c.requests[0];
        return { ...base, done: Boolean(a), status, href: `/services/appointments?purpose=${encodeURIComponent(st.purpose)}${req ? `&request=${req.id}` : ""}`, action: a ? "Мои записи" : "Записаться" };
      }
      case "check": {
        const ok = st.check === "photo" ? Boolean(photo) : push > 0;
        return { ...base, done: ok, status: ok ? (st.check === "photo" ? (photo?.status === "APPROVED" ? "принято" : "на проверке") : "включены") : null, href: st.href, action: ok ? "Открыть" : "Сделать" };
      }
      case "notifyTeachers": {
        const m = manual.get(st.key);
        return { ...base, done: Boolean(m), status: m ? (m.note ?? "отправлено") : null, href: null, action: "Сообщить" };
      }
      case "read": {
        const m = manual.get(st.key);
        return { ...base, done: Boolean(m), status: m ? "прочитано" : null, href: null, action: "Прочитать" };
      }
    }
  });
  const required = steps.filter((x) => !x.optional);
  return { id: c.id, code: c.code, status: c.status, createdAt: c.createdAt, situation: sit as Situation, steps, progress: { done: required.filter((x) => x.done).length, total: required.length }, complete: required.every((x) => x.done) };
}
export type CaseView = NonNullable<Awaited<ReturnType<typeof getCase>>>;

/** Отметить шаг «прочитал». */
export async function markRead(s: CaseStudent, caseId: string, key: string) {
  const c = await prisma.situationCase.findFirst({ where: { id: caseId, studentId: s.id, status: "OPEN" }, select: { code: true } });
  const st = c && situationByCode(c.code)?.steps.find((x) => x.key === key);
  if (!st || st.kind !== "read") return false;
  await prisma.caseStep.upsert({ where: { caseId_key: { caseId, key } }, create: { caseId, key }, update: {} });
  return true;
}

/**
 * «Предупредить преподавателей»: всем, кто ведёт пары группы студента в текущем периоде, — уведомление с датами.
 * Один раз на ситуацию. Возвращает число преподавателей.
 */
export async function notifyTeachers(s: CaseStudent & { lastName: string; firstName: string }, caseId: string, from: string, to: string, note: string) {
  const c = await prisma.situationCase.findFirst({ where: { id: caseId, studentId: s.id, status: "OPEN" }, select: { code: true, steps: { select: { key: true } } } });
  const st = c && situationByCode(c.code)?.steps.find((x) => x.kind === "notifyTeachers");
  if (!c || !st) throw new CaseError("Ситуация не найдена");
  if (c.steps.some((x) => x.key === st.key)) throw new CaseError("Преподаватели уже предупреждены");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new CaseError("Проверьте даты");
  const teachers = await prisma.lesson.findMany({ where: { groupId: s.groupId, OR: [{ subgroup: null }, { subgroup: s.subgroup }], ...currentPeriod() }, distinct: ["teacherId"], select: { teacher: { select: { userId: true } }, group: { select: { name: true } } } });
  const ids = teachers.map((t) => t.teacher.userId).filter((x): x is string => !!x);
  const d = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".");
  const group = teachers[0]?.group.name ?? "";
  await notify(ids, {
    kind: "SYSTEM",
    title: `${s.lastName} ${s.firstName} (${group}) болеет`,
    body: `Не будет на занятиях с ${d(from)} по ${d(to)}.${note.trim() ? ` ${note.trim().slice(0, 200)}` : ""} Заявление об уважительной причине — через деканат.`,
    link: "/teacher",
    dedupeKey: `sick:${caseId}`,
  });
  // честно: уведомление получают только преподаватели с кабинетом; остальных студент предупреждает сам
  const total = new Set(teachers.map((t) => t.teacher.userId ?? Math.random())).size;
  const stepNote = ids.length === total ? `${ids.length} преподавателям, ${d(from)}–${d(to)}` : ids.length ? `${ids.length} из ${total} преподавателей (у остальных нет кабинета — предупредите лично), ${d(from)}–${d(to)}` : `преподаватели группы ещё не подключены — предупредите их лично, ${d(from)}–${d(to)}`;
  await prisma.caseStep.create({ data: { caseId, key: st.key, note: stepNote } });
  return ids.length;
}

export async function closeCase(s: CaseStudent, caseId: string, status: "DONE" | "CANCELLED") {
  const { count } = await prisma.situationCase.updateMany({ where: { id: caseId, studentId: s.id, status: "OPEN" }, data: { status, closedAt: new Date() } });
  return count > 0;
}

/** Ситуации для каталога (с открытой у студента, если есть). */
export async function situationsFor(studentId: string) {
  const open = await prisma.situationCase.findMany({ where: { studentId, status: "OPEN" }, select: { id: true, code: true } });
  return situations.map((s) => ({ code: s.code, title: s.title, short: s.short, tone: s.tone, openCaseId: open.find((o) => o.code === s.code)?.id ?? null }));
}

export const docTitle = (k: keyof typeof docKinds) => docKinds[k].title;
