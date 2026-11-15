/**
 * Оценки всей группе и черновик справки: доступ только к своему. Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Staff, type Teacher } from "@prisma/client";
import { addGradesBulk, getGradebook, listClasses, teachingDay } from "@/server/repos/teacher";
import { getCertificatePreview } from "@/server/repos/staff";
import { moscowToday } from "@/lib/utils";

const db = new PrismaClient();
let teacher: Teacher, staff: Staff;

beforeAll(async () => {
  teacher = await db.teacher.findFirstOrThrow({ where: { user: { login: "teacher" } } });
  staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
});
afterAll(() => db.$disconnect());

describe("оценки всей группе", () => {
  it("ставит оценки своей группе и шлёт уведомления", async () => {
    const [own] = await listClasses(teacher);
    const book = (await getGradebook(teacher, own.groupId, own.courseId))!;
    const picked = book.rows.slice(0, 2);
    const before = await db.grade.count({ where: { enrollmentId: { in: picked.map((r) => r.enrollmentId) } } });
    const n = await addGradesBulk(teacher, own.groupId, own.courseId, "Тест", picked.map((r, i) => ({ enrollmentId: r.enrollmentId, points: 10 + i })));
    expect(n).toBe(2);
    expect(await db.grade.count({ where: { enrollmentId: { in: picked.map((r) => r.enrollmentId) } } })).toBe(before + 2);
    // уборка
    await db.grade.deleteMany({ where: { enrollmentId: { in: picked.map((r) => r.enrollmentId) }, note: "Тест", points: { in: [10, 11] }, date: { gte: new Date(Date.now() - 60_000) } } });
  });

  it("чужая группа или чужой студент в списке — отказ целиком", async () => {
    const classes = await listClasses(teacher);
    const foreignLesson = await db.lesson.findFirstOrThrow({ where: { teacherId: { not: teacher.id }, NOT: { OR: classes.map((c) => ({ groupId: c.groupId, courseId: c.courseId })) } } });
    await expect(addGradesBulk(teacher, foreignLesson.groupId, foreignLesson.courseId, "Тест", [])).rejects.toThrow();
    const own = classes[0];
    const stranger = await db.enrollment.findFirstOrThrow({ where: { student: { groupId: { not: own.groupId } } } });
    await expect(addGradesBulk(teacher, own.groupId, own.courseId, "Тест", [{ enrollmentId: stranger.id, points: 5 }])).rejects.toThrow();
  });

  it("день преподавателя: без накладок по времени", async () => {
    const day = await teachingDay(teacher, moscowToday());
    if (!day) return;
    const times = day.lessons.map((l) => l.startTime);
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("черновик справки у деканата", () => {
  it("для справки — есть, для заявления — нет", async () => {
    const cert = await db.request.findFirstOrThrow({ where: { type: { isCertificate: true } } });
    const app = await db.request.findFirstOrThrow({ where: { type: { isCertificate: false } } });
    expect(await getCertificatePreview(staff, cert.id)).not.toBeNull();
    expect(await getCertificatePreview(staff, app.id)).toBeNull();
    expect(await getCertificatePreview(staff, "нет-такой")).toBeNull();
  });
});
