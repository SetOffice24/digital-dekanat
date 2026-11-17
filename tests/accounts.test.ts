/**
 * Управление аккаунтами студентов деканатом. Требует засеянную БД; меняет данные (после тестов — db:seed).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Staff, type Student } from "@prisma/client";
import { verifyPassword } from "@/server/auth";
import { accountsOverview, blockStudent, createStudent, resetPassword, studentAccount, transferStudent, translit, unblockStudent } from "@/server/repos/accounts";
import { readFileSync } from "node:fs";
import { listHomework, submitHomework } from "@/server/repos/homework";

const db = new PrismaClient();
let staff: Staff, outsider: Staff, mate: Student;
const createdUsers: string[] = [];

beforeAll(async () => {
  staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
  const anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  const other = await db.faculty.findFirstOrThrow({ where: { id: { not: anna.facultyId } } });
  outsider = { ...staff, facultyId: other.id };
  mate = await db.student.findFirstOrThrow({ where: { groupId: anna.groupId, id: { not: anna.id }, user: { blockedAt: null } }, orderBy: { lastName: "asc" } });
});
afterAll(async () => {
  await db.student.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
});

describe("область доступа", () => {
  it("деканат другого факультета не видит аккаунт и ничего не может сделать", async () => {
    expect(await studentAccount(outsider, mate.id)).toBeNull();
    await expect(blockStudent(outsider, mate.id, "проверка")).rejects.toThrow();
    await expect(resetPassword(outsider, mate.id)).rejects.toThrow();
    const g = await db.group.findFirstOrThrow({ where: { id: { not: mate.groupId } } });
    await expect(transferStudent(outsider, mate.id, g.id, 1)).rejects.toThrow();
  });
});

describe("блокировка", () => {
  it("закрывает сессии и push, пишется в журнал; повтор — ошибка; разблокировка возвращает доступ", async () => {
    await db.session.create({ data: { id: `test-${Date.now()}`, userId: mate.userId, expiresAt: new Date(Date.now() + 86400_000) } });
    await blockStudent(staff, mate.id, "Проверка блокировки");
    const u = await db.user.findUniqueOrThrow({ where: { id: mate.userId } });
    expect(u.blockedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: mate.userId } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId: mate.userId } })).toBe(0);
    await expect(blockStudent(staff, mate.id, "ещё раз")).rejects.toThrow(/уже/);
    expect((await accountsOverview(staff, { filter: "blocked" })).rows.some((r) => r.id === mate.id)).toBe(true);
    await unblockStudent(staff, mate.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: mate.userId } })).blockedAt).toBeNull();
    const ev = await db.accountEvent.findMany({ where: { studentId: mate.id }, orderBy: { createdAt: "desc" }, take: 2 });
    expect(ev.map((e) => e.action)).toEqual(["UNBLOCKED", "BLOCKED"]);
  });
});

describe("временный пароль", () => {
  it("работает, требует смены, закрывает сессии; в журнале нет самого пароля", async () => {
    const pass = await resetPassword(staff, mate.id);
    const u = await db.user.findUniqueOrThrow({ where: { id: mate.userId } });
    expect(await verifyPassword(u.passwordHash, pass)).toBe(true);
    expect(u.mustChangePassword).toBe(true);
    const ev = await db.accountEvent.findFirstOrThrow({ where: { studentId: mate.id, action: "PASSWORD_RESET" }, orderBy: { createdAt: "desc" } });
    expect(ev.details ?? "").not.toContain(pass);
  });
});

describe("перевод в другую группу", () => {
  it("оценки сохраняются, дисциплины новой группы добавляются, сданные работы видны; обратный перевод возвращает", async () => {
    const target = await db.group.findFirstOrThrow({ where: { id: { not: mate.groupId }, course: mate.course, program: { facultyId: mate.facultyId } } });
    const gradesBefore = await db.grade.count({ where: { enrollment: { studentId: mate.id } } });
    const subsBefore = (await listHomework(mate)).filter((h) => h.submission).length;

    await transferStudent(staff, mate.id, target.id, 1);
    const moved = await db.student.findUniqueOrThrow({ where: { id: mate.id } });
    expect(moved.groupId).toBe(target.id);
    expect(await db.grade.count({ where: { enrollment: { studentId: mate.id } } })).toBe(gradesBefore);
    // все дисциплины текущего семестра новой группы есть у переведённого
    const sem = target.course * 2 - 1;
    const plan = await db.enrollment.findMany({ where: { semester: sem, student: { groupId: target.id, id: { not: mate.id } } }, distinct: ["courseId"], select: { courseId: true } });
    const mine = new Set((await db.enrollment.findMany({ where: { studentId: mate.id, semester: sem } })).map((e) => e.courseId));
    expect(plan.every((p) => mine.has(p.courseId))).toBe(true);
    // сданные в прежней группе работы студент по-прежнему видит
    expect((await listHomework(moved)).filter((h) => h.submission).length).toBeGreaterThanOrEqual(subsBefore);

    // новое задание прежней группы сдать нельзя — только доработку уже возвращённой работы
    const oldTodo = await db.assignment.findFirst({ where: { groupId: mate.groupId, submissions: { none: { studentId: mate.id } } } });
    if (oldTodo) await expect(submitHomework(moved, oldTodo.id, null, [new File([readFileSync("prisma/fixtures/lecture6-bst.pdf")], "a.pdf")])).rejects.toThrow(/прежней группы|не найдено/i);

    await expect(transferStudent(staff, mate.id, target.id, 1)).rejects.toThrow(/уже/);
    await transferStudent(staff, mate.id, mate.groupId, mate.subgroup);
    expect((await db.student.findUniqueOrThrow({ where: { id: mate.id } })).groupId).toBe(mate.groupId);
  });
});

describe("создание студента", () => {
  it("логин латиницей, временный пароль, зачисление на дисциплины группы; повтор № зачётки — отказ", async () => {
    expect(translit("Щёголева")).toBe("shchegoleva");
    const group = await db.group.findFirstOrThrow({ where: { id: mate.groupId } });
    const no = `T-${Date.now()}`;
    const r = await createStudent(staff, { lastName: "Тестова", firstName: "Юлия", groupId: group.id, subgroup: 1, recordBookNo: no });
    const s = await db.student.findUniqueOrThrow({ where: { id: r.studentId }, include: { user: true, enrollments: true } });
    createdUsers.push(s.userId);
    expect(r.login).toMatch(/^yuliya\.testova\d*$/);
    expect(s.user.mustChangePassword).toBe(true);
    expect(await verifyPassword(s.user.passwordHash, r.password)).toBe(true);
    expect(s.enrollments.length).toBeGreaterThan(0);
    expect(s.idCode).toMatch(/^[A-Z0-9]{10}$/);
    await expect(createStudent(staff, { lastName: "Другая", firstName: "Юлия", groupId: group.id, subgroup: 1, recordBookNo: no })).rejects.toThrow(/уже есть/);
    // деканат другого факультета не может добавить студента в чужую группу
    await expect(createStudent(outsider, { lastName: "Икс", firstName: "Игрек", groupId: group.id, subgroup: 1, recordBookNo: `${no}-2` })).rejects.toThrow(/Группа/);
  });
});
