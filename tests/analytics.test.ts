/**
 * Успеваемость для деканата и преподавателя: цифры совпадают со студенческими, доступ — только своё. Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Staff, type Student, type Teacher } from "@prisma/client";
import { courseStats, groupGradebook, groupsOverview, studentFile, teacherStudentCard, applyFilter } from "@/server/repos/analytics";
import { currentSemester, getEnrollments, summarize } from "@/server/repos/student";
import { forecast } from "@/lib/grading";

const db = new PrismaClient();
let staff: Staff, teacher: Teacher, anna: Student, petr: Student;

beforeAll(async () => {
  staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
  teacher = await db.teacher.findFirstOrThrow({ where: { user: { login: "teacher" } } });
  anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  petr = await db.student.findFirstOrThrow({ where: { user: { login: "petr.ozerov" } } });
});
afterAll(() => db.$disconnect());

describe("прогноз оценки", () => {
  it("пороги 60/75/90 % и зачёт", () => {
    expect(forecast(0.59, false)).toBe("2");
    expect(forecast(0.6, false)).toBe("3");
    expect(forecast(0.75, false)).toBe("4");
    expect(forecast(0.9, false)).toBe("5");
    expect(forecast(0.6, true)).toBe("зачёт");
    expect(forecast(0.5, true)).toBe("незачёт");
  });
});

describe("ведомость деканата", () => {
  it("та же группа, те же студенты и те же баллы, что видит студент", async () => {
    const gb = (await groupGradebook(staff, anna.groupId))!;
    expect(gb.rows.length).toBe(await db.student.count({ where: { groupId: anna.groupId } }));
    const row = gb.rows.find((r) => r.id === anna.id)!;
    const mine = summarize(await getEnrollments(anna), currentSemester(anna));
    for (const c of mine.current.filter((x) => x.enrollment.grades.length)) {
      const cell = row.cells[c.enrollment.courseId];
      expect(cell && cell.kind === "current" ? cell.points : null).toBe(c.points);
    }
    expect(row.avg?.toFixed(2)).toBe(mine.avg?.toFixed(2));
  });

  it("долг Петра виден в ведомости и в фильтре «с долгами»", async () => {
    const gb = (await groupGradebook(staff, petr.groupId))!;
    expect(gb.rows.find((r) => r.id === petr.id)!.debts).toBeGreaterThan(0);
    expect(applyFilter(gb.rows, "debts").map((r) => r.id)).toContain(petr.id);
  });

  it("прошлый семестр — итоговые оценки", async () => {
    const gb = (await groupGradebook(staff, petr.groupId, 4))!;
    expect(gb.semester).toBe(4);
    expect(Object.values(gb.rows[0].cells).some((c) => c?.kind === "final")).toBe(true);
  });

  it("сотрудник другого факультета не видит ни группу, ни личное дело", async () => {
    const annaFac = (await db.student.findUniqueOrThrow({ where: { id: anna.id } })).facultyId;
    const other = await db.faculty.findFirstOrThrow({ where: { id: { not: annaFac } } });
    const outsider = { id: staff.id, userId: staff.userId, facultyId: other.id };
    expect(await groupGradebook(outsider, anna.groupId)).toBeNull();
    expect(await studentFile(outsider, anna.id)).toBeNull();
    const groups = await groupsOverview(outsider);
    expect(groups.map((g) => g.name)).not.toContain("ИВТ-24-1");
    expect(await studentFile(staff, anna.id)).not.toBeNull();
  });
});

describe("статистика преподавателя", () => {
  it("своя дисциплина — есть; чужая — null; студент чужой группы — null", async () => {
    const own = await db.lesson.findFirstOrThrow({ where: { teacherId: teacher.id } });
    const st = (await courseStats(teacher, own.groupId, own.courseId))!;
    expect(st.rows.length).toBeGreaterThan(0);
    const foreign = await db.lesson.findFirstOrThrow({ where: { teacherId: { not: teacher.id }, groupId: { not: own.groupId } } });
    expect(await courseStats(teacher, foreign.groupId, foreign.courseId)).toBeNull();
    const ownStudent = await db.student.findFirstOrThrow({ where: { groupId: own.groupId } });
    expect(await teacherStudentCard(teacher, own.groupId, own.courseId, ownStudent.id)).not.toBeNull();
    expect(await teacherStudentCard(teacher, own.groupId, own.courseId, petr.id)).toBeNull();
  });
});
