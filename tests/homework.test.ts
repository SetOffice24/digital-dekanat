/**
 * Материалы и домашние задания: доступ только к своему, проверки файлов. Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Student, type Teacher } from "@prisma/client";
import { getAssignmentForTeacher, getHomework, listAssignments, listHomework, reviewSubmission, submitHomework, createAssignment } from "@/server/repos/homework";
import { canAccessAttachment, checkFile } from "@/server/files";

const db = new PrismaClient();
let anna: Student, petr: Student, teacher: Teacher;
const viewer = async (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true } });
const doc = (name: string, text = "решение") => new File([text], name, { type: "application/pdf" });

beforeAll(async () => {
  anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  petr = await db.student.findFirstOrThrow({ where: { user: { login: "petr.ozerov" } } });
  teacher = await db.teacher.findFirstOrThrow({ where: { user: { login: "teacher" } } });
});
afterAll(() => db.$disconnect());

describe("студент: только задания своей группы", () => {
  it("список — только своя группа; чужое задание по id — null", async () => {
    const mine = await listHomework(anna);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((h) => h.groupId === anna.groupId)).toBe(true);
    const foreign = await db.assignment.findFirstOrThrow({ where: { groupId: petr.groupId } });
    expect(await getHomework(anna, foreign.id)).toBeNull();
  });

  it("нельзя сдать чужое, без файла и неподходящий формат", async () => {
    const foreign = await db.assignment.findFirstOrThrow({ where: { groupId: petr.groupId } });
    await expect(submitHomework(anna, foreign.id, null, [doc("a.pdf")])).rejects.toThrow();
    const own = (await listHomework(anna)).find((h) => h.state === "todo")!;
    await expect(submitHomework(anna, own.id, null, [])).rejects.toThrow();
    await expect(submitHomework(anna, own.id, null, [doc("virus.exe")])).rejects.toThrow();
    expect(() => checkFile({ name: "big.pdf", size: 11 * 1024 * 1024 })).toThrow();
    // только Word, PDF, Excel, PowerPoint
    for (const bad of ["notes.md", "code.py", "data.csv", "photo.png", "archive.zip"]) expect(() => checkFile({ name: bad, size: 100 })).toThrow();
    for (const ok of ["a.pdf", "b.docx", "c.doc", "d.xlsx", "e.pptx"]) expect(() => checkFile({ name: ok, size: 100 })).not.toThrow();
  });

  it("сдача → «на проверке»; повторная заменяет файлы; принятое не меняется", async () => {
    const own = (await listHomework(anna)).find((h) => h.state === "todo")!;
    await submitHomework(anna, own.id, "первая", [doc("one.pdf"), doc("two.docx")]);
    let sub = await db.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: own.id, studentId: anna.id } }, include: { files: true } });
    expect(sub.status).toBe("SUBMITTED");
    expect(sub.files.length).toBe(2);
    await submitHomework(anna, own.id, "вторая", [doc("final.docx")]);
    sub = await db.submission.findUniqueOrThrow({ where: { id: sub.id }, include: { files: true } });
    expect(sub.files.map((f) => f.name)).toEqual(["final.docx"]);
    const accepted = (await listHomework(anna)).find((h) => h.state === "accepted")!;
    await expect(submitHomework(anna, accepted.id, null, [doc("x.xlsx")])).rejects.toThrow();
  });
});

describe("файлы: скачать можно только своё", () => {
  it("сдача Анны — Анне и её преподавателю, но не Петру", async () => {
    const f = await db.attachment.findFirstOrThrow({ where: { submission: { studentId: anna.id, assignment: { teacherId: teacher.id } } } });
    expect(await canAccessAttachment(await viewer("anna.lesnova"), f.id)).not.toBeNull();
    expect(await canAccessAttachment(await viewer("petr.ozerov"), f.id)).toBeNull();
    expect(await canAccessAttachment(await viewer("teacher"), f.id)).not.toBeNull();
    expect(await canAccessAttachment(await viewer("dekanat"), f.id)).toBeNull();
  });

  it("материалы группы видят её студенты; чужая группа и чужой преподаватель — нет", async () => {
    const econFile = await db.attachment.findFirstOrThrow({ where: { material: { groupId: petr.groupId } } });
    expect(await canAccessAttachment(await viewer("petr.ozerov"), econFile.id)).not.toBeNull();
    expect(await canAccessAttachment(await viewer("anna.lesnova"), econFile.id)).toBeNull();
    expect(await canAccessAttachment(await viewer("teacher"), econFile.id)).toBeNull();
  });
});

describe("преподаватель: только свои дисциплины", () => {
  it("чужая группа — нет списка, нет выдачи, нет проверки", async () => {
    const econ = await db.assignment.findFirstOrThrow({ where: { groupId: petr.groupId }, include: { submissions: true } });
    expect(await listAssignments(teacher, econ.groupId, econ.courseId)).toBeNull();
    expect(await getAssignmentForTeacher(teacher, econ.id)).toBeNull();
    expect(await reviewSubmission(teacher, econ.submissions[0].id, "ACCEPTED", null)).toBeNull();
    await expect(createAssignment(teacher, "x", econ.groupId, econ.courseId, { title: "t", description: "d", dueAt: new Date(Date.now() + 86400000) }, [])).rejects.toThrow();
  });

  it("свою сдачу можно вернуть на доработку — студент видит статус", async () => {
    const sub = await db.submission.findFirstOrThrow({ where: { status: "SUBMITTED", assignment: { teacherId: teacher.id } } });
    expect(await reviewSubmission(teacher, sub.id, "RETURNED", "Исправьте вывод")).toBe(true);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("RETURNED");
  });
});
