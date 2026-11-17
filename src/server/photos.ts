import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";

/**
 * Фото студента для документов (пропуск, студенческий билет).
 * Любой загруженный файл перекодируется: JPEG 600×800 (3:4), без EXIF (геолокация, модель телефона),
 * с учётом поворота. Хранится на диске (DATA_DIR/photos) под случайным именем, отдаётся только через /api/photos/[id].
 */
export const PHOTO_MAX_MB = 5;
export const PHOTO_W = 600;
export const PHOTO_H = 800;
const MIN_W = 300;
const MIN_H = 400;

export class PhotoError extends Error {}

const dir = () => path.join(process.env.DATA_DIR || "./data", "photos");
const KEY = /^[a-f0-9]{36}$/;

/** JPEG, PNG или WebP — по содержимому, а не по имени. */
export function photoKind(buf: Buffer) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/** Проверить и привести фото к стандарту. Ошибки — понятным текстом для студента. */
export async function normalizePhoto(buf: Buffer) {
  if (!buf.length) throw new PhotoError("Файл пустой");
  if (buf.length > PHOTO_MAX_MB * 1024 * 1024) throw new PhotoError(`Фото больше ${PHOTO_MAX_MB} МБ — уменьшите его`);
  if (!photoKind(buf)) throw new PhotoError("Нужна фотография в формате JPG, PNG или WebP");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(buf, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new PhotoError("Не удалось прочитать фото — попробуйте другой файл");
  }
  // с учётом поворота (фото с телефона часто «лежит на боку» и разворачивается по EXIF)
  const rotated = (meta.orientation ?? 1) >= 5;
  const w = (rotated ? meta.height : meta.width) ?? 0;
  const h = (rotated ? meta.width : meta.height) ?? 0;
  if (w < MIN_W || h < MIN_H) throw new PhotoError(`Фото слишком маленькое (${w}×${h}) — нужно не меньше ${MIN_W}×${MIN_H} пикселей`);
  // sharp по умолчанию не переносит метаданные: EXIF с координатами и моделью телефона отбрасывается
  return sharp(buf, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(PHOTO_W, PHOTO_H, { fit: "cover", position: "attention" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export async function storePhoto(jpeg: Buffer) {
  await fs.mkdir(dir(), { recursive: true });
  const storageKey = randomBytes(18).toString("hex");
  await fs.writeFile(path.join(dir(), storageKey), jpeg);
  return storageKey;
}

export function readPhoto(storageKey: string) {
  if (!KEY.test(storageKey)) throw new Error("bad key");
  return fs.readFile(path.join(dir(), storageKey));
}

export async function removePhotos(keys: string[]) {
  await Promise.all(
    keys
      .filter((k) => KEY.test(k))
      .map((k) =>
        fs.unlink(path.join(dir(), k)).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") console.error("photo cleanup failed", k, e.code);
        }),
      ),
  );
}

/** Код электронного студенческого: 10 символов без похожих (0/O, 1/I). */
export function newIdCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(10), (b) => abc[b % abc.length]).join("");
}

/** Студенческий действителен до 31 августа текущего учебного года. */
export function idValidUntil(now = new Date()) {
  const y = now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(y, 7, 31));
}
