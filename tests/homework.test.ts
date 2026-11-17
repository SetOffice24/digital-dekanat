/**
 * Материалы и домашние задания: доступ только к своему, проверки файлов. Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Student, type Teacher } from "@prisma/client";
import { getAssignmentForTeacher, getHomework, listAssignments, listHomework, reviewSubmission, submitHomework, createAssignment } from "@/server/repos/homework";
import { readFileSync } from "node:fs";
import { canAccessAttachment, checkContent, checkFile } from "@/server/files";

const db = new PrismaClient();
let anna: Student, petr: Student, teacher: Teacher;
const viewer = async (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true } });
// настоящие документы из prisma/fixtures — сервер проверяет содержимое, а не только расширение
const fixture = { pdf: readFileSync("prisma/fixtures/lecture6-bst.pdf"), docx: readFileSync("prisma/fixtures/solution.docx"), xlsx: readFileSync("prisma/fixtures/regression-data.xlsx"), pptx: readFileSync("prisma/fixtures/lecture4-normalization.pptx") };
const doc = (name: string) => new File([fixture[name.split(".").pop() as keyof typeof fixture] ?? Buffer.from("MZ")], name);

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

  it("содержимое должно совпадать с расширением: переименованный html/exe и чужой тип Office — отказ", async () => {
    expect(() => checkContent("ok.pdf", fixture.pdf)).not.toThrow();
    expect(() => checkContent("ok.docx", fixture.docx)).not.toThrow();
    expect(() => checkContent("ok.xlsx", fixture.xlsx)).not.toThrow();
    expect(() => checkContent("ok.pptx", fixture.pptx)).not.toThrow();
    expect(() => checkContent("page.pdf", Buffer.from("<html><script>alert(1)</script>"))).toThrow();
    expect(() => checkContent("prog.doc", Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toThrow();
    expect(() => checkContent("table.xlsx", fixture.docx)).toThrow();
    const own = (await listHomework(anna)).find((h) => h.state === "todo")!;
    await expect(submitHomework(anna, own.id, null, [new File(["<html>"], "fake.pdf")])).rejects.toThrow(/не похож/);
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
    expect(sub.version).toBe(2);
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
    expect(await reviewSubmission(teacher, econ.submissions[0].id, econ.submissions[0].version, "ACCEPTED", null)).toBeNull();
    await expect(createAssignment(teacher, "x", econ.groupId, econ.courseId, { title: "t", description: "d", dueAt: new Date(Date.now() + 86400000) }, [])).rejects.toThrow();
  });

  it("свою сдачу можно вернуть на доработку — студент видит статус", async () => {
    const sub = await db.submission.findFirstOrThrow({ where: { status: "SUBMITTED", assignment: { teacherId: teacher.id } } });
    expect(await reviewSubmission(teacher, sub.id, sub.version, "RETURNED", "Исправьте вывод")).toBe(true);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("RETURNED");
  });

  it("проверка привязана к версии: если студент прислал новую — «принять» старую нельзя", async () => {
    const own = (await listHomework(anna)).find((h) => h.teacherId === teacher.id && h.state !== "accepted")!;
    await submitHomework(anna, own.id, "v-a", [doc("a.pdf")]);
    const v1 = await db.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: own.id, studentId: anna.id } } });
    await submitHomework(anna, own.id, "v-b", [doc("b.pdf")]);
    expect(await reviewSubmission(teacher, v1.id, v1.version, "ACCEPTED", null)).toBe("stale");
    expect((await db.submission.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe("SUBMITTED");
    expect(await reviewSubmission(teacher, v1.id, v1.version + 1, "ACCEPTED", null)).toBe(true);
    // принятое не перезаписать даже параллельной отправкой
    await expect(submitHomework(anna, own.id, "поздно", [doc("c.pdf")])).rejects.toThrow();
  });
});
