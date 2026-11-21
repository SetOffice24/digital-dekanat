/**
 * Единое окно (демо): «Мои документы», заявки на выплаты и направление в общежитие, перезачёт на согласовании
 * у преподавателя, записи на приём в деканат, оценки услуг, жизненная ситуация. Все люди и документы вымышленные;
 * файлы документов — нарисованные заглушки PDF.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { DocKind, PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dueDate } from "../src/lib/utils";

type Ctx = { prisma: PrismaClient; now: Date; staffUserId: string; teacherUserId: string; demoTeacherId: string };
const DAY = 86400000;

/** Заглушка документа: PDF с подписью «демо» (латиницей — встроенный шрифт без кириллицы). */
async function stubPdf(label: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 300]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 20, y: 20, width: 380, height: 260, borderColor: rgb(0.6, 0.6, 0.7), borderWidth: 2 });
  page.drawText("UNIVER - DEMO DOCUMENT", { x: 40, y: 230, size: 16, font });
  page.drawText(label, { x: 40, y: 190, size: 13, font });
  page.drawText("Fictional data for hackathon prototype", { x: 40, y: 60, size: 10, font, color: rgb(0.4, 0.4, 0.45) });
  return Buffer.from(await pdf.save());
}

export async function seedServices(c: Ctx) {
  const { prisma, now } = c;
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const docDir = path.join(process.env.DATA_DIR || "./data", "documents");
  await fs.rm(docDir, { recursive: true, force: true });
  await fs.mkdir(docDir, { recursive: true });

  const student = (login: string) => prisma.student.findFirstOrThrow({ where: { user: { login } }, select: { id: true, userId: true, groupId: true, facultyId: true } });
  const anna = await student("anna.lesnova");
  const petr = await student("petr.ozerov");
  const type = (code: string) => prisma.requestType.findUniqueOrThrow({ where: { code } });

  /* ---------- «Мои документы» ---------- */
  const doc = async (studentId: string, kind: DocKind, label: string, opts: { status?: "PENDING" | "VERIFIED"; validDays?: number; daysAgo?: number } = {}) => {
    const buf = await stubPdf(label);
    const storageKey = randomBytes(18).toString("hex");
    await fs.writeFile(path.join(docDir, storageKey), buf);
    const pending = opts.status === "PENDING";
    return prisma.studentDocument.create({
      data: { studentId, kind, fileName: `${label}.pdf`, mime: "application/pdf", size: buf.length, storageKey, status: pending ? "PENDING" : "VERIFIED", validUntil: opts.validDays != null ? new Date(at(opts.validDays).toISOString().slice(0, 10) + "T00:00:00Z") : null, reviewedByUserId: pending ? null : c.staffUserId, reviewedAt: pending ? null : at(-(opts.daysAgo ?? 20) + 1), createdAt: at(-(opts.daysAgo ?? 20)) },
    });
  };
  await doc(anna.id, "PASSPORT", "Passport");
  await doc(anna.id, "SNILS", "SNILS");
  await doc(anna.id, "BANK", "Bank details");
  await doc(anna.id, "FLUORO", "Fluorography", { validDays: 10, daysAgo: 355 }); // скоро истекает — помощник напомнит
  const petrBank = await doc(petr.id, "BANK", "Bank details", { status: "PENDING", daysAgo: 2 });

  /* ---------- заявки ---------- */
  const mk = async (s: { id: string; userId: string }, code: string, payload: Record<string, string>, o: { daysAgo: number; status?: "NEW" | "IN_REVIEW" | "READY" | "DONE"; caseId?: string; docs?: string[]; rating?: [number, string | null]; message?: string }) => {
    const t = await type(code);
    const created = at(-o.daysAgo);
    const status = o.status ?? "NEW";
    return prisma.request.create({
      data: {
        studentId: s.id, typeId: t.id, payload, status, createdAt: created, dueAt: dueDate(created, t.slaDays), caseId: o.caseId,
        rating: o.rating?.[0], ratingComment: o.rating?.[1] ?? null, ratedAt: o.rating ? at(-o.daysAgo + 2) : null,
        documents: { create: (o.docs ?? []).map((documentId) => ({ documentId })) },
        events: { create: [{ toStatus: "NEW", authorUserId: s.userId, createdAt: created }, ...(status !== "NEW" ? [{ fromStatus: "NEW" as const, toStatus: status, authorUserId: c.staffUserId, message: o.message, createdAt: at(-o.daysAgo + 1) }] : [])] },
      },
    });
  };

  // Пётр: «нужны деньги» — ситуация + материальная помощь в деканате, реквизиты ещё не проверены
  const petrCase = await prisma.situationCase.create({ data: { studentId: petr.id, code: "money", createdAt: at(-2) } });
  await mk(petr, "APP_MATHELP", { reason: "Трудная жизненная ситуация", text: "Родители временно без работы, нужна помощь на оплату общежития." }, { daysAgo: 2, caseId: petrCase.id, docs: [petrBank.id] });

  // одногруппник Анны: перезачёт «Алгоритмов» — ждёт решения демо-преподавателя, потом уйдёт в деканат
  const mate = await prisma.student.findFirst({ where: { groupId: anna.groupId, id: { not: anna.id } }, orderBy: { lastName: "asc" }, select: { id: true, userId: true } });
  const teaches = await prisma.lesson.count({ where: { teacherId: c.demoTeacherId, groupId: anna.groupId, course: { name: "Алгоритмы и структуры данных" } } });
  if (mate && teaches) {
    const rc = await mk(mate, "APP_RECREDIT", { course: "Алгоритмы и структуры данных", prior: "Колледж информатики, 2025, «Алгоритмы и структуры данных», 144 ч", grade: "отлично" }, { daysAgo: 1 });
    await prisma.requestApproval.create({ data: { requestId: rc.id, idx: 0, teacherId: c.demoTeacherId, status: "PENDING" } });
  }

  // другие студенты: направление в общежитие с документами, выплаты (одна выполнена с низкой оценкой)
  const others = await prisma.student.findMany({ where: { id: { notIn: [anna.id, petr.id] } }, orderBy: { lastName: "desc" }, take: 4, select: { id: true, userId: true } });
  if (others.length >= 4) {
    const [a, b, d, e] = others;
    const pass = await doc(b.id, "PASSPORT", "Passport");
    const fl = await doc(b.id, "FLUORO", "Fluorography", { validDays: 200, status: "PENDING", daysAgo: 1 });
    await mk(b, "DORM_CHECKIN", { dateFrom: at(5).toISOString().slice(0, 10), wish: "Тихий этаж" }, { daysAgo: 1, docs: [pass.id, fl.id] });
    const bank = await doc(a.id, "BANK", "Bank details");
    await mk(a, "APP_MATHELP", { reason: "Болезнь", text: "Лечение после операции, нужны лекарства." }, { daysAgo: 9, docs: [bank.id] }); // просрочена — уйдёт руководителю
    await mk(d, "ACC_BANK", { bank: "Демо-банк" }, { daysAgo: 12, status: "DONE", message: "Реквизиты переданы на начисление стипендии.", rating: [3, "Сделали, но пришлось дважды спрашивать в чате, где статус."] });
    await mk(e, "APP_TRANSFER", { target: "09.03.03 Прикладная информатика", basis: "Хочу больше практики в разработке." }, { daysAgo: 3, status: "IN_REVIEW", message: "Взяли в работу, сверяем учебные планы." });
  }

  // оценки уже выданных справок Анны (для аналитики)
  await prisma.request.updateMany({ where: { studentId: anna.id, status: "DONE" }, data: { rating: 5, ratingComment: "Быстро и без очереди.", ratedAt: at(-9) } });

  /* ---------- приём в деканате ---------- */
  const slot = (daysFromNow: number, hhmm: string) => {
    const d = new Date(now.getTime() + daysFromNow * DAY);
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1); // ближайший будний день
    return new Date(`${day.toISOString().slice(0, 10)}T${hhmm}:00+03:00`);
  };
  const appt = (s: { id: string }, startsAt: Date, purpose: string, requestId?: string) => prisma.appointment.create({ data: { studentId: s.id, startsAt, purpose, requestId, slotKey: `DEANERY:${startsAt.toISOString()}` } });
  const petrMilitary = await prisma.request.findFirst({ where: { studentId: petr.id, type: { code: "CERT_MILITARY" } }, select: { id: true } });
  await appt(petr, slot(1, "14:30"), "Забрать справку для военкомата", petrMilitary?.id);
  if (others[2]) await appt(others[2], slot(1, "10:15"), "Принести оригинал справки о болезни");

  return { documents: await prisma.studentDocument.count(), approvals: await prisma.requestApproval.count() };
}
