/**
 * Фото студента и электронный студенческий: обработка файла, доступ, модерация деканатом. Требует засеянную БД.
 * Создаёт свои фото и удаляет их в конце.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { PrismaClient, type Staff, type Student } from "@prisma/client";
import { normalizePhoto, photoKind } from "@/server/photos";
import { myPhotos, photoForViewer, reviewPhoto, uploadPhoto, verifyStudent } from "@/server/repos/photos";

const db = new PrismaClient();
let anna: Student, petr: Student, staff: Staff, outsiderStaff: Staff;
const created: string[] = [];

/** Тестовое фото с EXIF (модель телефона) — после обработки метаданных быть не должно. */
const jpeg = (w = 900, h = 1200) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#bcd" } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestPhone", Model: "X1" } })
    .toBuffer();

beforeAll(async () => {
  anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  petr = await db.student.findFirstOrThrow({ where: { user: { login: "petr.ozerov" } } });
  staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
  const other = await db.faculty.findFirstOrThrow({ where: { id: { not: anna.facultyId } } });
  outsiderStaff = { ...staff, facultyId: other.id };
});
afterAll(async () => {
  await db.studentPhoto.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

describe("обработка файла", () => {
  it("JPEG → 600×800 без EXIF; не-картинка и слишком маленькое фото — отказ", async () => {
    const out = await normalizePhoto(await jpeg());
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([600, 800, "jpeg"]);
    expect(meta.exif).toBeUndefined();
    expect(photoKind(Buffer.from("<html>"))).toBeNull();
    await expect(normalizePhoto(Buffer.from("%PDF-1.4 not an image"))).rejects.toThrow(/JPG/);
    await expect(normalizePhoto(await jpeg(200, 260))).rejects.toThrow(/маленькое/);
  });
});

describe("загрузка и проверка деканатом", () => {
  it("новое фото — на проверке, прежнее действует; приём заменяет прежнее; повтор решения не проходит", async () => {
    const before = await myPhotos(anna);
    expect(before.current).not.toBeNull();
    const p = await uploadPhoto(anna, await jpeg());
    created.push(p.id);
    const mid = await myPhotos(anna);
    expect(mid.latest?.id).toBe(p.id);
    expect(mid.current?.id).toBe(before.current!.id);

    expect(await reviewPhoto(outsiderStaff, p.id, "APPROVED", null)).toBe(false); // чужой факультет
    expect(await reviewPhoto(staff, p.id, "APPROVED", null)).toBe(true);
    expect(await reviewPhoto(staff, p.id, "REJECTED", "поздно")).toBe(false); // уже проверено
    const after = await myPhotos(anna);
    expect(after.current?.id).toBe(p.id);
    expect(await db.studentPhoto.count({ where: { studentId: anna.id, status: "APPROVED" } })).toBe(1);
  });

  it("повторная загрузка заменяет фото на проверке — в очереди одно фото на студента", async () => {
    const a = await uploadPhoto(petr, await jpeg());
    const b = await uploadPhoto(petr, await jpeg());
    created.push(a.id, b.id);
    expect(await db.studentPhoto.count({ where: { studentId: petr.id, status: "PENDING" } })).toBe(1);
    expect(await db.studentPhoto.findUnique({ where: { id: a.id } })).toBeNull();
  });
});

describe("кто видит фото", () => {
  it("свой студент и деканат факультета — да; другой студент, преподаватель и деканат другого факультета — нет", async () => {
    const photo = await db.studentPhoto.findFirstOrThrow({ where: { studentId: anna.id, status: "APPROVED" } });
    const asStudent = (s: Student) => ({ role: "STUDENT" as const, student: s, staff: null });
    expect(await photoForViewer(asStudent(anna), photo.id)).not.toBeNull();
    expect(await photoForViewer(asStudent(petr), photo.id)).toBeNull();
    expect(await photoForViewer({ role: "STAFF", student: null, staff }, photo.id)).not.toBeNull();
    expect(await photoForViewer({ role: "STAFF", student: null, staff: outsiderStaff }, photo.id)).toBeNull();
    expect(await photoForViewer({ role: "TEACHER", student: null, staff: null }, photo.id)).toBeNull();
  });

  it("публичная проверка студенческого — без фото и номера зачётки; неверный код — не найден", async () => {
    const v = await verifyStudent(anna.idCode!);
    expect(v?.lastName).toBe(anna.lastName);
    expect(v && "recordBookNo" in v).toBe(false);
    expect(v && "photos" in v).toBe(false);
    expect(await verifyStudent("ZZZZZZZZZZ")).toBeNull();
    expect(await verifyStudent("../../etc")).toBeNull();
  });
});
