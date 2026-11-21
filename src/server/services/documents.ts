import "server-only";
/**
 * «Мои документы» студента: загружается один раз и подставляется в заявки.
 * Персональные данные — поэтому строже, чем обычные вложения:
 * - только PDF, JPG, PNG до 10 МБ; содержимое должно соответствовать формату;
 * - фото перекодируются (sharp) — снимаются EXIF и геометки;
 * - файл лежит под случайным именем в DATA_DIR/documents, отдаётся только /api/documents/[id] после проверки прав;
 * - видят: сам студент и деканат его факультета. Преподавателям документы не видны.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { DocKind, DocStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { isWholePdf } from "../files";
import { notify } from "../notify";
import { studentScope, type SessionStaff } from "../repos/staff";
import { docKinds } from "@/config/services";
import { moscowToday } from "@/lib/utils";

export const MAX_DOC_MB = 10;
/** Квота студента: не больше 30 файлов и 100 МБ — загрузки не забьют диск сервера. */
const MAX_DOCS = 30;
const MAX_TOTAL_MB = 100;
const dir = () => path.join(process.env.DATA_DIR || "./data", "documents");
const OPEN_STATUSES = ["NEW", "IN_REVIEW", "NEED_INFO"] as const;

export class DocumentError extends Error {}

type DocStudent = { id: string; userId: string };

function sniff(buf: Buffer): "pdf" | "jpg" | "png" | null {
  if (isWholePdf(buf)) return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

/** Действителен ли документ сегодня (по сроку и проверке). */
export const isUsable = (d: { status: DocStatus; validUntil: Date | null }, today = moscowToday()) => d.status !== "REJECTED" && (!d.validUntil || d.validUntil >= today);

/** Документы студента, новые сверху; по каждому виду актуальный — первый. */
export function listMyDocuments(s: DocStudent) {
  return prisma.studentDocument.findMany({
    where: { studentId: s.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, fileName: true, size: true, validUntil: true, status: true, reviewNote: true, createdAt: true, _count: { select: { requests: true } } },
  });
}
export type MyDocument = Awaited<ReturnType<typeof listMyDocuments>>[number];

/** Актуальный документ вида (новейший действительный) — его подставляем в заявки. */
export async function usableDocument(studentId: string, kind: DocKind) {
  const rows = await prisma.studentDocument.findMany({ where: { studentId, kind, status: { not: "REJECTED" } }, orderBy: { createdAt: "desc" }, take: 3 });
  return rows.find((d) => isUsable(d)) ?? null;
}

export async function uploadDocument(s: DocStudent, kind: DocKind, file: File, validUntil?: string | null) {
  if (!(kind in docKinds)) throw new DocumentError("Неизвестный вид документа");
  if (!file || !file.size) throw new DocumentError("Выберите файл");
  if (file.size > MAX_DOC_MB * 1024 * 1024) throw new DocumentError(`Файл больше ${MAX_DOC_MB} МБ`);
  const used = await prisma.studentDocument.aggregate({ where: { studentId: s.id }, _count: { _all: true }, _sum: { size: true } });
  if (used._count._all >= MAX_DOCS) throw new DocumentError(`Загружено уже ${MAX_DOCS} документов — удалите старые, чтобы добавить новый`);
  if ((used._sum.size ?? 0) + file.size > MAX_TOTAL_MB * 1024 * 1024) throw new DocumentError(`Документы занимают больше ${MAX_TOTAL_MB} МБ — удалите старые`);
  let buf: Buffer = Buffer.from(await file.arrayBuffer());
  const fmt = sniff(buf);
  if (!fmt) throw new DocumentError("Подходят PDF, JPG и PNG — проверьте, что файл открывается");
  let mime = "application/pdf";
  let ext = "pdf";
  if (fmt !== "pdf") {
    // фото документа: перекодируем — уходят EXIF, геометка, лишние метаданные; крупные уменьшаем
    const sharp = (await import("sharp")).default;
    buf = await sharp(buf, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    mime = "image/jpeg";
    ext = "jpg";
  }
  let until: Date | null = null;
  if (docKinds[kind].expires) {
    if (!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new DocumentError(`Укажите, до какого числа действует «${docKinds[kind].title}»`);
    until = new Date(`${validUntil}T00:00:00Z`);
    if (until < moscowToday()) throw new DocumentError("Срок действия уже истёк — нужен действующий документ");
  }
  await fs.mkdir(dir(), { recursive: true });
  const storageKey = randomBytes(18).toString("hex");
  await fs.writeFile(path.join(dir(), storageKey), buf);
  try {
    return await prisma.studentDocument.create({ data: { studentId: s.id, kind, fileName: `${docKinds[kind].title}.${ext}`, mime, size: buf.length, storageKey, validUntil: until } });
  } catch (e) {
    await fs.unlink(path.join(dir(), storageKey)).catch(() => {});
    throw e;
  }
}

/** Удалить свой документ — если он не приложен к заявке в работе (иначе деканат останется без документа). */
export async function deleteDocument(s: DocStudent, id: string) {
  const d = await prisma.studentDocument.findFirst({ where: { id, studentId: s.id }, select: { id: true, storageKey: true, requests: { where: { request: { status: { in: [...OPEN_STATUSES] } } }, select: { request: { select: { number: true } } } } } });
  if (!d) return false;
  if (d.requests.length) throw new DocumentError(`Документ приложен к заявке №${d.requests[0].request.number} — удалить можно после её завершения`);
  // условие повторяется в самом удалении: если заявку с документом подали параллельно — не удаляем
  const { count } = await prisma.studentDocument.deleteMany({ where: { id, studentId: s.id, requests: { none: { request: { status: { in: [...OPEN_STATUSES] } } } } } });
  if (!count) throw new DocumentError("Документ только что приложили к заявке — удалить можно после её завершения");
  await fs.unlink(path.join(dir(), d.storageKey)).catch(() => {});
  return true;
}

/**
 * Заменить отклонённый документ в конкретной открытой заявке (не во всех сразу): новая версия загружается и
 * приложится к этой заявке, старая остаётся в её истории с отметкой «заменён». Заявка, ждавшая ответа студента,
 * возвращается деканату в работу; деканат получает уведомление.
 */
export async function replaceRequestDocument(s: DocStudent, requestId: string, oldDocId: string, file: File, validUntil?: string | null) {
  const link = await prisma.requestDocument.findFirst({
    where: { requestId, documentId: oldDocId, replacedAt: null, request: { studentId: s.id, status: { in: [...OPEN_STATUSES] } }, document: { studentId: s.id } },
    select: { document: { select: { kind: true, status: true } }, request: { select: { number: true, status: true, student: { select: { facultyId: true } }, type: { select: { title: true } } } } },
  });
  if (!link) throw new DocumentError("Заявка уже не в работе или документ заменён — обновите страницу");
  if (link.document.status !== "REJECTED") throw new DocumentError("Заменить можно документ, который деканат не принял");
  const fresh = await uploadDocument(s, link.document.kind, file, validUntil);
  const title = docKinds[link.document.kind].title;
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.requestDocument.updateMany({ where: { requestId, documentId: oldDocId, replacedAt: null }, data: { replacedAt: new Date() } });
      if (!count) throw new DocumentError("Документ уже заменён — обновите страницу");
      await tx.requestDocument.create({ data: { requestId, documentId: fresh.id } });
      // ждали ответа студента — заявка снова у деканата (условно: если статус уже сменили, не трогаем)
      const back = await tx.request.updateMany({ where: { id: requestId, status: "NEED_INFO" }, data: { status: "IN_REVIEW" } });
      await tx.requestEvent.create({ data: { requestId, fromStatus: link.request.status, toStatus: back.count ? "IN_REVIEW" : link.request.status, authorUserId: s.userId, message: `Студент заменил документ «${title}» — новая версия на проверке` } });
    });
  } catch (e) {
    await prisma.studentDocument.delete({ where: { id: fresh.id } }).catch(() => {});
    await fs.unlink(path.join(dir(), fresh.storageKey)).catch(() => {});
    throw e;
  }
  const staff = await prisma.staff.findMany({ where: { OR: [{ facultyId: null }, { facultyId: link.request.student.facultyId }] }, select: { userId: true } });
  await notify(
    staff.map((x) => x.userId),
    { kind: "REQUEST_STATUS", title: "Документ заменён", body: `«${link.request.type.title}» № ${link.request.number}: студент загрузил новую версию — «${title}».`, link: `/staff/requests/${requestId}`, dedupeKey: `doc-replaced:${fresh.id}` },
  );
  return fresh;
}

/** Условие «документ виден сотруднику деканата». */
export const reviewerWhere = (staff: SessionStaff): Prisma.StudentDocumentWhereInput => ({ student: studentScope(staff) });

/** Проверка документа деканатом: принят / не принят (с причиной — студент получит уведомление). */
export async function reviewDocument(staff: SessionStaff, id: string, status: "VERIFIED" | "REJECTED", note: string | null) {
  const d = await prisma.studentDocument.findFirst({ where: { id, ...reviewerWhere(staff) }, select: { id: true, kind: true, student: { select: { userId: true } } } });
  if (!d) return false;
  if (status === "REJECTED" && !note?.trim()) throw new DocumentError("Укажите, что не так с документом");
  await prisma.studentDocument.update({ where: { id }, data: { status, reviewNote: status === "REJECTED" ? note!.trim().slice(0, 300) : null, reviewedByUserId: staff.userId, reviewedAt: new Date() } });
  if (status === "REJECTED")
    await notify([d.student.userId], { kind: "SYSTEM", title: `Документ не принят: ${docKinds[d.kind].title}`, body: `${note!.trim().slice(0, 200)} Загрузите новый в «Моих документах».`, link: "/services/documents", dedupeKey: `doc-rejected:${id}` });
  return true;
}

type Viewer = { id: string; role: string; student: { id: string } | null; staff: SessionStaff | null };

/** Документ для скачивания — только тем, кому он виден (иначе null → 404). */
export async function documentForViewer(u: Viewer, id: string) {
  const own = u.role === "STUDENT" && u.student ? { studentId: u.student.id } : null;
  const where: Prisma.StudentDocumentWhereInput | null = own ?? (u.role === "STAFF" && u.staff ? reviewerWhere(u.staff) : null);
  if (!where) return null;
  return prisma.studentDocument.findFirst({ where: { id, ...where }, select: { id: true, fileName: true, mime: true, storageKey: true } });
}

export async function readDocument(storageKey: string) {
  if (!/^[a-f0-9]{36}$/.test(storageKey)) throw new Error("bad key");
  return fs.readFile(path.join(dir(), storageKey));
}

/** Документы со сроком, который скоро истекает (для подсказок помощника). */
export async function expiringDocuments(studentId: string, days = 14) {
  const today = moscowToday();
  const rows = await prisma.studentDocument.findMany({ where: { studentId, validUntil: { not: null, lte: new Date(today.getTime() + days * 86400000) }, status: { not: "REJECTED" } }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, validUntil: true } });
  // только актуальный по каждому виду (если уже загрузили новый — не напоминаем)
  const newest = new Map<DocKind, (typeof rows)[number]>();
  for (const r of rows) if (!newest.has(r.kind)) newest.set(r.kind, r);
  const latestAll = await prisma.studentDocument.findMany({ where: { studentId, kind: { in: [...newest.keys()] } }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true } });
  const latestId = new Map<DocKind, string>();
  for (const r of latestAll) if (!latestId.has(r.kind)) latestId.set(r.kind, r.id);
  return [...newest.values()].filter((r) => latestId.get(r.kind) === r.id);
}
