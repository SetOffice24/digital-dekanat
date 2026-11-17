import "server-only";
/**
 * Фото студента для документов и электронный студенческий билет.
 * Студент загружает фото → «на проверке» → деканат своего факультета принимает или отклоняет с причиной.
 * Действует последнее принятое фото; новое не заменяет его, пока деканат не примет.
 * Видят фото: сам студент и деканат его факультета. Преподаватели и другие студенты — нет.
 */
import { prisma } from "../db";
import { notify } from "../notify";
import { newIdCode, normalizePhoto, removePhotos, storePhoto } from "../photos";
import { studentScope, type SessionStaff } from "./staff";
import type { SessionStudent } from "./student";

const photoSel = { id: true, status: true, comment: true, createdAt: true, reviewedAt: true } as const;

/* ---------------- студент ---------------- */

/** Действующее фото + последнее непринятое (на проверке или отклонённое), если оно новее. */
export async function myPhotos(s: Pick<SessionStudent, "id">) {
  const [current, latest] = await Promise.all([
    prisma.studentPhoto.findFirst({ where: { studentId: s.id, status: "APPROVED" }, orderBy: { reviewedAt: "desc" }, select: photoSel }),
    prisma.studentPhoto.findFirst({ where: { studentId: s.id, status: { not: "APPROVED" } }, orderBy: { createdAt: "desc" }, select: photoSel }),
  ]);
  return { current, latest: latest && (!current || latest.createdAt > current.createdAt) ? latest : null };
}

/** Загрузить новое фото. Предыдущее непринятое (на проверке / отклонённое) удаляется — в очереди у деканата одно фото на студента. */
export async function uploadPhoto(s: Pick<SessionStudent, "id">, buf: Buffer) {
  const jpeg = await normalizePhoto(buf);
  const storageKey = await storePhoto(jpeg);
  try {
    const old = await prisma.studentPhoto.findMany({ where: { studentId: s.id, status: { not: "APPROVED" } }, select: { id: true, storageKey: true } });
    const photo = await prisma.$transaction(async (tx) => {
      await tx.studentPhoto.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      return tx.studentPhoto.create({ data: { studentId: s.id, storageKey, size: jpeg.length }, select: photoSel });
    });
    await removePhotos(old.map((o) => o.storageKey));
    return photo;
  } catch (e) {
    await removePhotos([storageKey]);
    throw e;
  }
}

/** Данные электронного студенческого. Код создаётся при первом обращении (для студентов, добавленных после сида). */
export async function studentIdCard(s: Pick<SessionStudent, "id">) {
  const select = {
    id: true, lastName: true, firstName: true, middleName: true, recordBookNo: true, course: true, idCode: true,
    faculty: { select: { name: true, shortName: true } }, group: { select: { name: true } }, program: { select: { code: true, name: true } },
  } as const;
  let st = await prisma.student.findUniqueOrThrow({ where: { id: s.id }, select });
  // код уникален; при (крайне маловероятном) совпадении пробуем ещё раз
  for (let i = 0; i < 3 && !st.idCode; i++) {
    st = await prisma.student.update({ where: { id: s.id }, data: { idCode: newIdCode() }, select }).catch(() => st);
  }
  return st;
}

/* ---------------- проверка по QR (публично) ---------------- */

/** Публичная проверка студенческого: только «обучается / не найден», фамилия с инициалами, факультет, группа. Без фото и номера зачётки. */
export async function verifyStudent(code: string) {
  if (!/^[A-Z0-9]{10}$/.test(code)) return null;
  return prisma.student.findUnique({
    where: { idCode: code },
    select: { lastName: true, firstName: true, middleName: true, course: true, faculty: { select: { name: true } }, group: { select: { name: true } } },
  });
}

/* ---------------- деканат ---------------- */

/** Фото на проверке у студентов своего факультета — старые сверху. */
export function photoQueue(staff: SessionStaff) {
  return prisma.studentPhoto.findMany({
    where: { status: "PENDING", student: studentScope(staff) },
    orderBy: { createdAt: "asc" },
    select: { ...photoSel, student: { select: { id: true, lastName: true, firstName: true, middleName: true, group: { select: { name: true } }, photos: { where: { status: "APPROVED" }, select: { id: true }, take: 1 } } } },
  });
}

export function photoQueueCount(staff: SessionStaff) {
  return prisma.studentPhoto.count({ where: { status: "PENDING", student: studentScope(staff) } });
}

/** Фото студента в личном деле. Студент другого факультета → null. */
export async function staffStudentPhotos(staff: SessionStaff, studentId: string) {
  const ok = await prisma.student.count({ where: { id: studentId, ...studentScope(staff) } });
  if (!ok) return null;
  return myPhotos({ id: studentId });
}

/** Группа целиком: у кого есть принятое фото (скачать для пропуска), у кого нет. Группа вне области → null. */
export async function groupPhotos(staff: SessionStaff, groupId: string) {
  const rows = await prisma.student.findMany({
    where: { groupId, ...studentScope(staff) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, photos: { where: { status: { in: ["APPROVED", "PENDING"] } }, select: { id: true, status: true } } },
  });
  return rows.map((s) => ({ ...s, approved: s.photos.find((p) => p.status === "APPROVED") ?? null, pending: s.photos.some((p) => p.status === "PENDING") }));
}

export type PhotoDecision = "APPROVED" | "REJECTED";

/**
 * Принять или отклонить фото (причина обязательна при отказе — её увидит студент).
 * Только фото «на проверке» и только своего факультета; повтор/гонка двух сотрудников → false.
 * При приёме прежнее принятое фото удаляется — действует одно.
 */
export async function reviewPhoto(staff: SessionStaff, photoId: string, decision: PhotoDecision, comment: string | null) {
  const p = await prisma.studentPhoto.findFirst({ where: { id: photoId, status: "PENDING", student: studentScope(staff) }, select: { id: true, studentId: true, student: { select: { userId: true } } } });
  if (!p) return false;
  const old = await prisma.$transaction(async (tx) => {
    const { count } = await tx.studentPhoto.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: decision, comment, reviewedAt: new Date(), reviewedById: staff.userId } });
    if (!count) return null;
    if (decision !== "APPROVED") return [];
    const prev = await tx.studentPhoto.findMany({ where: { studentId: p.studentId, status: "APPROVED", id: { not: p.id } }, select: { id: true, storageKey: true } });
    await tx.studentPhoto.deleteMany({ where: { id: { in: prev.map((x) => x.id) } } });
    return prev;
  });
  if (!old) return false;
  await removePhotos(old.map((x) => x.storageKey));
  try {
    await notify([p.student.userId], {
      kind: "SYSTEM",
      title: decision === "APPROVED" ? "Фото принято" : "Фото не подошло",
      body: decision === "APPROVED" ? "Фото для документов принято деканатом — оно уже в электронном студенческом." : `Загрузите другое фото. Причина: ${comment ?? "не указана"}`,
      link: "/profile",
      dedupeKey: `photo:${p.id}`,
    });
  } catch (e) {
    console.error("notify failed", e);
  }
  return true;
}

/* ---------------- доступ к файлу ---------------- */

type Viewer = { role: "STUDENT" | "STAFF" | "TEACHER"; student: { id: string } | null; staff: SessionStaff | null };

/** Фото для показа/скачивания: свой студент или деканат его факультета. Иначе null (→ 404). */
export async function photoForViewer(user: Viewer, photoId: string) {
  const p = await prisma.studentPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, storageKey: true, status: true, studentId: true, student: { select: { lastName: true, firstName: true, facultyId: true, group: { select: { name: true } } } } },
  });
  if (!p) return null;
  if (user.role === "STUDENT" && user.student) return p.studentId === user.student.id ? p : null;
  if (user.role === "STAFF" && user.staff) return !user.staff.facultyId || user.staff.facultyId === p.student.facultyId ? p : null;
  return null;
}
