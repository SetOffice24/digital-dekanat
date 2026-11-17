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

// только привычные документы: Word, PDF, Excel, PowerPoint (решение команды); исполняемые, html и прочее не принимаем
const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export const ACCEPT = Object.keys(ALLOWED).map((e) => "." + e).join(",");

const dir = () => path.join(process.env.DATA_DIR || "./data", "uploads");

export class UploadError extends Error {}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/**
 * Имя файла без путей, управляющих и невидимых символов (в том числе bidi-символов, которыми можно
 * визуально подменить расширение: «отчёт‮fdp.exe»), в нормальной форме Unicode, до 120 символов.
 */
export function safeName(name: string) {
  const base = (name.split(/[\\/]/).pop() ?? "file").normalize("NFC");
  return (
    base
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g, "")
      .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
      .trim()
      .slice(-120) || "file"
  );
}

export function checkFile(f: { name: string; size: number }) {
  if (!f.size) throw new UploadError(`Файл «${safeName(f.name)}» пустой`);
  if (f.size > MAX_BYTES) throw new UploadError(`Файл «${safeName(f.name)}» больше ${MAX_FILE_MB} МБ`);
  if (!ALLOWED[ext(f.name)]) throw new UploadError(`Формат «.${ext(f.name)}» не поддерживается`);
}

/**
 * Содержимое должно соответствовать расширению (не только имя): PDF — «%PDF-»; старые .doc/.xls/.ppt — контейнер OLE2;
 * .docx/.xlsx/.pptx — ZIP с [Content_Types].xml и папкой своего типа. Переименованный .exe или .html не пройдёт.
 */
export function checkContent(name: string, buf: Buffer) {
  const e = ext(name);
  const head = buf.subarray(0, 8);
  const ok =
    e === "pdf"
      ? buf.subarray(0, 5).toString("latin1") === "%PDF-"
      : e === "doc" || e === "xls" || e === "ppt"
        ? head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
        : (() => {
            if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) return false;
            // имена файлов внутри ZIP хранятся открытым текстом в заголовках
            const text = buf.toString("latin1");
            const folder = e === "docx" ? "word/" : e === "xlsx" ? "xl/" : "ppt/";
            return text.includes("[Content_Types].xml") && text.includes(folder);
          })();
  if (!ok) throw new UploadError(`Файл «${safeName(name)}» не похож на настоящий .${e} — проверьте, что он открывается в программе`);
}

/** Проверить и сохранить файлы из формы. Ничего не сохраняет, если хоть один не подходит; при сбое записи — удаляет уже записанные. */
export async function storeFiles(files: File[], uploadedById: string) {
  const list = files.filter((f) => f && f.size > 0);
  if (list.length > MAX_FILES) throw new UploadError(`Не больше ${MAX_FILES} файлов за раз`);
  list.forEach(checkFile);
  if (list.reduce((a, f) => a + f.size, 0) > MAX_TOTAL_MB * 1024 * 1024) throw new UploadError(`Все файлы вместе — не больше ${MAX_TOTAL_MB} МБ`);
  const buffers = await Promise.all(list.map(async (f) => Buffer.from(await f.arrayBuffer())));
  list.forEach((f, i) => checkContent(f.name, buffers[i]));
  await fs.mkdir(dir(), { recursive: true });
  const saved: { name: string; mime: string; size: number; storageKey: string; uploadedById: string }[] = [];
  try {
    for (const [i, f] of list.entries()) {
      const storageKey = randomBytes(18).toString("hex");
      await fs.writeFile(path.join(dir(), storageKey), buffers[i]);
      saved.push({ name: safeName(f.name), mime: ALLOWED[ext(f.name)], size: buffers[i].length, storageKey, uploadedById });
    }
  } catch (e) {
    await removeStored(saved.map((s) => s.storageKey));
    throw e;
  }
  return saved;
}

export async function readStored(storageKey: string) {
  if (!/^[a-f0-9]{36}$/.test(storageKey)) throw new Error("bad key");
  return fs.readFile(path.join(dir(), storageKey));
}

/** Удалить файлы с диска. Отсутствующий файл — не ошибка; остальные сбои пишем в лог (не роняем запрос). */
export async function removeStored(keys: string[]) {
  await Promise.all(
    keys
      .filter((k) => /^[a-f0-9]{36}$/.test(k))
      .map((k) =>
        fs.unlink(path.join(dir(), k)).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") console.error("file cleanup failed", k, e.code);
        }),
      ),
  );
}

/** Заголовок «скачать файл»: ASCII-имя для старых браузеров + полное имя по RFC 5987. */
export function contentDisposition(name: string) {
  // кириллица в запасном имени превратилась бы в «____»; тогда — нейтральное имя с тем же расширением
  const clean = safeName(name).replace(/["\\]/g, "_");
  const ascii = /^[\x20-\x7e]+$/.test(clean) ? clean : `file.${ext(clean) || "bin"}`;
  const utf = encodeURIComponent(safeName(name)).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf}`;
}

type Viewer = { id: string; role: "STUDENT" | "STAFF" | "TEACHER"; student: { id: string; groupId: string } | null; teacher: { id: string } | null; staff?: { facultyId: string | null } | null };

/** Может ли пользователь скачать файл. Студент — материалы/задания своей группы и свои сдачи; преподаватель — свои дисциплины. */
export async function canAccessAttachment(user: Viewer, attachmentId: string) {
  const a = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true, name: true, mime: true, size: true, storageKey: true,
      material: { select: { groupId: true, courseId: true } },
      assignment: { select: { groupId: true, courseId: true } },
      submission: { select: { studentId: true, assignment: { select: { groupId: true, courseId: true } } } },
      message: { select: { conversationId: true } },
    },
  });
  if (!a) return null;
  // вложение сообщения — тем, кто видит диалог (участник; деканат — обращения своего факультета)
  if (a.message) {
    const visible = await prisma.conversation.count({
      where: {
        id: a.message.conversationId,
        ...(user.role === "STAFF" && user.staff ? { kind: "DEANERY" as const, ...(user.staff.facultyId ? { facultyId: user.staff.facultyId } : {}) } : { participants: { some: { userId: user.id } } }),
      },
    });
    return visible ? a : null;
  }
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
