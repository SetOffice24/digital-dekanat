/**
 * Посещаемость и распознавание «кого нет». Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Student, type Teacher } from "@prisma/client";
import { getLessonAttendance, saveAttendance } from "@/server/repos/teacher";
import { getAttendance } from "@/server/repos/student";
import { absencesInRange } from "@/server/repos/staff";
import { rulesAbsence } from "@/server/ai/attendance";
import { attendanceHistory, courseAttendance, groupAttendance, loadLessonAttendance, saveLessonAttendance, staffLesson } from "@/server/repos/attendance";
import { addDays, moscowToday } from "@/lib/utils";

const db = new PrismaClient();
let teacher: Teacher, anna: Student, petr: Student;

beforeAll(async () => {
  teacher = await db.teacher.findFirstOrThrow({ where: { user: { login: "teacher" } } });
  anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  petr = await db.student.findFirstOrThrow({ where: { user: { login: "petr.ozerov" } } });
});
afterAll(() => db.$disconnect());

describe("распознавание фразы преподавателя (без нейросети)", () => {
  const group = [
    { id: "1", lastName: "Зорин", firstName: "Даниил" },
    { id: "2", lastName: "Леснова", firstName: "Анна" },
    { id: "3", lastName: "Брусницына", firstName: "Злата" },
    { id: "4", lastName: "Брусницын", firstName: "Кирилл" },
    { id: "5", lastName: "Жаворонкова", firstName: "Алина" },
  ];
  it("падежи: «нет Зорина и Лесновой»", () => {
    expect(rulesAbsence("нет Зорина и Лесновой", group).absentIds.sort()).toEqual(["1", "2"]);
  });
  it("однофамильцы без имени — не угадываем, с именем — находим", () => {
    const g = rulesAbsence("не было Брусницыных", group);
    expect(g.absentIds).toEqual([]);
    expect(g.unclear.length).toBeGreaterThan(0);
    expect(rulesAbsence("нет Брусницына Кирилла", group).absentIds).toEqual(["4"]);
  });
  it("«были только …» — отсутствуют остальные", () => {
    expect(rulesAbsence("были только Зорин и Жаворонкова", group).absentIds.sort()).toEqual(["2", "3", "4"]);
  });
  it("«все были» — никого не отмечаем", () => {
    expect(rulesAbsence("все были", group)).toMatchObject({ absentIds: [], mode: "allPresent" });
  });
});

describe("посещаемость: доступ и правила", () => {
  it("своя прошедшая пара — сохраняется; повторное сохранение перезаписывает", async () => {
    const today = moscowToday();
    const lesson = await db.lesson.findFirstOrThrow({ where: { teacherId: teacher.id, date: { lt: today }, status: { not: "CANCELLED" } }, orderBy: { date: "desc" } });
    const data = (await getLessonAttendance(teacher, lesson.id))!;
    const one = data.students[0].id;
    expect(await saveAttendance(teacher, lesson.id, [one], today)).toMatchObject({ absent: 1 });
    expect((await db.attendance.findUniqueOrThrow({ where: { lessonId_studentId: { lessonId: lesson.id, studentId: one } } })).present).toBe(false);
    await saveAttendance(teacher, lesson.id, [], today);
    expect((await db.attendance.findUniqueOrThrow({ where: { lessonId_studentId: { lessonId: lesson.id, studentId: one } } })).present).toBe(true);
  });

  it("чужая пара — null и отказ", async () => {
    const foreign = await db.lesson.findFirstOrThrow({ where: { teacherId: { not: teacher.id } } });
    expect(await getLessonAttendance(teacher, foreign.id)).toBeNull();
    await expect(saveAttendance(teacher, foreign.id, [], moscowToday())).rejects.toThrow();
  });

  it("будущую пару и студента не из группы отметить нельзя", async () => {
    const today = moscowToday();
    const future = await db.lesson.findFirstOrThrow({ where: { teacherId: teacher.id, date: { gt: addDays(today, 1) } } });
    await expect(saveAttendance(teacher, future.id, [], today)).rejects.toThrow();
    const past = await db.lesson.findFirstOrThrow({ where: { teacherId: teacher.id, date: { lt: today }, status: { not: "CANCELLED" } } });
    await expect(saveAttendance(teacher, past.id, [petr.id], today)).rejects.toThrow();
  });

  it("студент видит только свои отметки; пропуски Анны совпадают с её заявлением", async () => {
    const a = await getAttendance(anna);
    expect(a.total).toBeGreaterThan(0);
    const mine = await db.attendance.count({ where: { studentId: anna.id } });
    expect(a.total).toBe(mine);
    const staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
    const today = moscowToday();
    const abs = await absencesInRange(staff, anna.id, addDays(today, -9), addDays(today, -7));
    expect(abs.length).toBeGreaterThan(0);
  });
});

describe("посещаемость: деканат, вкладка преподавателя, история студента", () => {
  it("деканат отмечает любую прошедшую пару; сотрудник другого факультета — нет", async () => {
    const staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
    const today = moscowToday();
    const lesson = await db.lesson.findFirstOrThrow({ where: { group: { name: "ЭК-23-2" }, date: { lt: today }, status: { not: "CANCELLED" } }, include: { group: { include: { program: true } } } });
    const data = (await loadLessonAttendance(staffLesson(staff, lesson.id)))!;
    expect(data.students.length).toBeGreaterThan(0);
    expect(await saveLessonAttendance(staffLesson(staff, lesson.id), [data.students[0].id], today)).toMatchObject({ absent: 1 });
    const other = await db.faculty.findFirstOrThrow({ where: { id: { not: lesson.group.program.facultyId } } });
    const outsider = { id: staff.id, userId: staff.userId, facultyId: other.id };
    expect(await loadLessonAttendance(staffLesson(outsider, lesson.id))).toBeNull();
    await expect(saveLessonAttendance(staffLesson(outsider, lesson.id), [], today)).rejects.toThrow();
    expect(await groupAttendance(outsider, lesson.groupId)).toBeNull();
  });

  it("вкладка «Посещаемость» преподавателя — только своя дисциплина", async () => {
    const own = await db.lesson.findFirstOrThrow({ where: { teacherId: teacher.id } });
    const data = (await courseAttendance(teacher, own.groupId, own.courseId, moscowToday()))!;
    expect(data.students.length).toBeGreaterThan(0);
    const foreign = await db.lesson.findFirstOrThrow({ where: { teacherId: { not: teacher.id }, groupId: { not: own.groupId } } });
    expect(await courseAttendance(teacher, foreign.groupId, foreign.courseId, moscowToday())).toBeNull();
  });

  it("история студента — только свои отметки; пропуски по заявлению помечены", async () => {
    const h = await attendanceHistory(anna);
    expect(h.total).toBe(await db.attendance.count({ where: { studentId: anna.id } }));
    expect(h.history.some((x) => !x.present && x.cover)).toBe(true);
    expect(h.courses.reduce((a, c) => a + c.total, 0)).toBe(h.total);
  });
});
