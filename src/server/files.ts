import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { prisma } from "./db";

/**
 * Файлы материалов и домашних заданий.
 * Хранятся на диске (DATA_DIR/uploads) под случайным именем — исходное имя только в БД.
 * Отдаются только через /api/files/[id] после проверки прав (canAccessAttachment).
 */
export const MAX_FILE_MB = 10;
export const MAX_FILES = 5;
export const MAX_TOTAL_MB = 25;
const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;

// только «учебные» форматы; исполняемые и html не принимаем
const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain",
  md: "text/plain",
  csv: "text/csv",
  py: "text/plain",
  ipynb: "application/json",
  sql: "text/plain",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export const ACCEPT = Object.keys(ALLOWED).map((e) => "." + e).join(",");

const dir = () => path.join(process.env.DATA_DIR || "./data", "uploads");

export class UploadError extends Error {}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** Имя файла без путей и управляющих символов, до 120 символов. */
export function safeName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(-120) || "file";
}

export function checkFile(f: { name: string; size: number }) {
  if (!f.size) throw new UploadError(`Файл «${safeName(f.name)}» пустой`);
  if (f.size > MAX_BYTES) throw new UploadError(`Файл «${safeName(f.name)}» больше ${MAX_FILE_MB} МБ`);
  if (!ALLOWED[ext(f.name)]) throw new UploadError(`Формат «.${ext(f.name)}» не поддерживается`);
}

/** Проверить и сохранить файлы из формы. Ничего не сохраняет, если хоть один не подходит. */
export async function storeFiles(files: File[], uploadedById: string) {
  const list = files.filter((f) => f && f.size > 0);
  if (list.length > MAX_FILES) throw new UploadError(`Не больше ${MAX_FILES} файлов за раз`);
  list.forEach(checkFile);
  if (list.reduce((a, f) => a + f.size, 0) > MAX_TOTAL_MB * 1024 * 1024) throw new UploadError(`Все файлы вместе — не больше ${MAX_TOTAL_MB} МБ`);
  await fs.mkdir(dir(), { recursive: true });
  const saved: { name: string; mime: string; size: number; storageKey: string; uploadedById: string }[] = [];
  for (const f of list) {
    const storageKey = randomBytes(18).toString("hex");
    await fs.writeFile(path.join(dir(), storageKey), Buffer.from(await f.arrayBuffer()));
    saved.push({ name: safeName(f.name), mime: ALLOWED[ext(f.name)], size: f.size, storageKey, uploadedById });
  }
  return saved;
}

export async function readStored(storageKey: string) {
  if (!/^[a-f0-9]{36}$/.test(storageKey)) throw new Error("bad key");
  return fs.readFile(path.join(dir(), storageKey));
}

export async function removeStored(keys: string[]) {
  await Promise.all(keys.filter((k) => /^[a-f0-9]{36}$/.test(k)).map((k) => fs.unlink(path.join(dir(), k)).catch(() => {})));
}

type Viewer = { id: string; role: "STUDENT" | "STAFF" | "TEACHER"; student: { id: string; groupId: string } | null; teacher: { id: string } | null };

/** Может ли пользователь скачать файл. Студент — материалы/задания своей группы и свои сдачи; преподаватель — свои дисциплины. */
export async function canAccessAttachment(user: Viewer, attachmentId: string) {
  const a = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true, name: true, mime: true, size: true, storageKey: true,
      material: { select: { groupId: true, courseId: true } },
      assignment: { select: { groupId: true, courseId: true } },
      submission: { select: { studentId: true, assignment: { select: { groupId: true, courseId: true } } } },
    },
  });
  if (!a) return null;
  const scope = a.material ?? a.assignment ?? a.submission?.assignment;
  if (!scope) return null;
  if (user.role === "STUDENT" && user.student) {
    if (a.submission) return a.submission.studentId === user.student.id ? a : null;
    return scope.groupId === user.student.groupId ? a : null;
  }
  if (user.role === "TEACHER" && user.teacher) {
    const teaches = await prisma.lesson.count({ where: { teacherId: user.teacher.id, groupId: scope.groupId, courseId: scope.courseId } });
    return teaches > 0 ? a : null;
  }
  return null;
}
