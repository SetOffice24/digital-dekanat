/**
 * Кабинет преподавателя: доступ только к своим группам/дисциплинам. Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Teacher } from "@prisma/client";
import { addGrade, deleteGrade, getGradebook, listClasses } from "@/server/repos/teacher";

const db = new PrismaClient();
let teacher: Teacher;
let own: { groupId: string; courseId: string };
let foreign: { groupId: string; courseId: string };

beforeAll(async () => {
  teacher = await db.teacher.findFirstOrThrow({ where: { user: { login: "teacher" } } });
  const classes = await listClasses(teacher);
  own = classes[0];
  // пара (группа, дисциплина), которой у преподавателя нет, но по которой есть записи студентов
  const lesson = await db.lesson.findFirstOrThrow({
    where: { teacherId: { not: teacher.id }, NOT: { OR: classes.map((c) => ({ groupId: c.groupId, courseId: c.courseId })) } },
  });
  foreign = { groupId: lesson.groupId, courseId: lesson.courseId };
});
afterAll(() => db.$disconnect());

describe("преподаватель видит и меняет только свои группы", () => {
  it("список классов — только свои занятия", async () => {
    const classes = await listClasses(teacher);
    expect(classes.length).toBeGreaterThanOrEqual(3);
    for (const c of classes) expect(await db.lesson.count({ where: { teacherId: teacher.id, groupId: c.groupId, courseId: c.courseId } })).toBeGreaterThan(0);
  });

  it("журнал своей группы открывается, чужой — null", async () => {
    const book = await getGradebook(teacher, own.groupId, own.courseId);
    expect(book).not.toBeNull();
    expect(book!.rows.length).toBeGreaterThan(0);
    expect(await getGradebook(teacher, foreign.groupId, foreign.courseId)).toBeNull();
    // своя группа + чужая дисциплина
    expect(await getGradebook(teacher, own.groupId, foreign.courseId)).toBeNull();
  });

  it("нельзя поставить оценку студенту чужой группы, можно своему", async () => {
    const foreignEnr = await db.enrollment.findFirstOrThrow({ where: { courseId: foreign.courseId, student: { groupId: foreign.groupId } } });
    const before = await db.grade.count({ where: { enrollmentId: foreignEnr.id } });
    await expect(addGrade(teacher, foreignEnr.id, 10, "Тест")).rejects.toThrow();
    expect(await db.grade.count({ where: { enrollmentId: foreignEnr.id } })).toBe(before);

    const book = await getGradebook(teacher, own.groupId, own.courseId);
    const row = book!.rows[0];
    const student = await db.student.findUniqueOrThrow({ where: { id: row.studentId } });
    const notesBefore = await db.notification.count({ where: { userId: student.userId, kind: "GRADE" } });
    const grade = await addGrade(teacher, row.enrollmentId, 7, "Тест");
    try {
      expect(grade.kind).toBe("CURRENT");
      expect(grade.points).toBe(7);
      expect(await db.notification.count({ where: { userId: student.userId, kind: "GRADE" } })).toBe(notesBefore + 1);
    } finally {
      await db.notification.deleteMany({ where: { userId: student.userId, kind: "GRADE", title: "Новая оценка", body: { endsWith: "7 баллов — Тест" }, createdAt: { gte: grade.date } } });
      expect(await deleteGrade(teacher, grade.id)).toBe(true);
    }
  });

  it("удалять можно только свои оценки и только текущие", async () => {
    const foreignGrade = await db.grade.findFirstOrThrow({ where: { kind: "CURRENT", enrollment: { courseId: foreign.courseId, student: { groupId: foreign.groupId } } } });
    expect(await deleteGrade(teacher, foreignGrade.id)).toBe(false);
    expect(await db.grade.findUnique({ where: { id: foreignGrade.id } })).not.toBeNull();

    const midterm = await db.grade.findFirst({ where: { kind: "MIDTERM", enrollment: { courseId: own.courseId, student: { groupId: own.groupId } } } });
    if (midterm) {
      expect(await deleteGrade(teacher, midterm.id)).toBe(false);
      expect(await db.grade.findUnique({ where: { id: midterm.id } })).not.toBeNull();
    }
  });
});
