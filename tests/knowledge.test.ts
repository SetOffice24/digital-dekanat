/**
 * Библиотека знаний: текст и поиск (без БД), извлечение из PDF/Word, права «по уровню автора»,
 * ответы помощника по библиотеке. Требует засеянную БД; свои материалы удаляет.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { chunkText, confident, extractText, rankChunks, stemRu } from "@/server/knowledge/text";
import { canEdit, createDoc, deleteDoc, getDoc, KnowledgeError, listDocs, searchKnowledge, updateDoc } from "@/server/repos/knowledge";
import { libraryAnswer } from "@/server/ai/library";
import { buildStudentContext } from "@/server/ai/context";
import { reply } from "@/server/ai/assistant";

const db = new PrismaClient();
const load = (login: string) => db.user.findUniqueOrThrow({ where: { login }, include: { student: true, teacher: true, staff: true } });
type U = Awaited<ReturnType<typeof load>>;
let anna: U, teacher: U, staff: U, outsider: U;
let algoCourseId: string, teacherDocId: string;

beforeAll(async () => {
  [anna, teacher, staff] = await Promise.all([load("anna.lesnova"), load("teacher"), load("dekanat")]);
  const algo = await db.knowledgeDoc.findFirstOrThrow({ where: { title: "Вопросы к экзамену" }, select: { id: true, courseId: true } });
  algoCourseId = algo.courseId!;
  teacherDocId = algo.id;
  // студент группы, у которой демо-преподаватель эту дисциплину не ведёт
  const taught = await db.lesson.findMany({ where: { teacherId: teacher.teacher!.id, courseId: algoCourseId }, distinct: ["groupId"], select: { groupId: true } });
  const other = await db.student.findFirstOrThrow({ where: { groupId: { notIn: taught.map((t) => t.groupId) } }, select: { user: { select: { login: true } } } });
  outsider = await load(other.user.login);
});
afterAll(async () => {
  await db.knowledgeDoc.deleteMany({ where: { title: { startsWith: "ТЕСТ " } } });
  await db.$disconnect();
});

describe("текст и поиск", () => {
  it("основа слова одинакова в разных падежах", () => {
    expect(stemRu("пересдачи")).toBe(stemRu("пересдачу"));
    expect(stemRu("стипендии")).toBe(stemRu("стипендию"));
  });
  it("разбивка по заголовкам: у фрагмента есть заголовок раздела", () => {
    const c = chunkText("Сроки\nРабота сдаётся до 23:59.\n\nБаллы\nДо 10 баллов за работу.");
    expect(c.map((x) => x.heading)).toEqual(["Сроки", "Баллы"]);
  });
  it("разговорные слова находят официальный текст, посторонний вопрос — ничего", () => {
    const items = [
      { id: "1", docId: "a", title: "Требования к лабораторным работам", heading: "Сроки и опоздания", text: "За каждую неделю опоздания максимальный балл снижается на 2." },
      { id: "2", docId: "b", title: "Стипендия", heading: "Когда выплачивается", text: "Стипендия перечисляется до 25 числа." },
    ];
    const lab = rankChunks("что если сдать лабу позже", items)[0];
    expect(lab.chunk.docId).toBe("a");
    expect(confident(rankChunks("когда приходит стипендия", items)[0], "когда приходит стипендия")).toBe(true);
    expect(rankChunks("какая погода завтра", items)).toHaveLength(0);
  });
});

describe("извлечение текста из файлов", () => {
  it("Word и PDF дают текст; не тот формат — понятная ошибка", async () => {
    const docx = await extractText("x.docx", await fs.readFile(path.join("prisma", "fixtures", "lab5-task.docx")));
    expect(docx).toContain("Хеш-таблица");
    const pdf = await extractText("x.pdf", await fs.readFile(path.join("prisma", "fixtures", "regression-guide.pdf")));
    expect(pdf.length).toBeGreaterThan(40);
    await expect(extractText("x.xlsx", Buffer.from("x"))).rejects.toThrow(/PDF и Word/);
  });
});

describe("кто что видит и меняет", () => {
  it("студент видит правила вуза и материалы своих дисциплин; чужой группе материал преподавателя не виден", async () => {
    const mine = await listDocs(anna);
    expect(mine.some((d) => d.scope === "UNIVERSITY")).toBe(true);
    expect(mine.some((d) => d.id === teacherDocId)).toBe(true);
    expect(await getDoc(outsider, teacherDocId)).toBeNull();
    const hits = await searchKnowledge(outsider, "вопросы к экзамену по алгоритмам");
    expect(hits.some((h) => h.docId === teacherDocId)).toBe(false);
  });

  it("преподаватель публикует только по своей дисциплине; деканат — только вуз или факультет", async () => {
    const foreign = await db.course.findFirstOrThrow({ where: { lessons: { none: { teacherId: teacher.teacher!.id } } }, select: { id: true } });
    await expect(createDoc(teacher, { title: "ТЕСТ чужая", body: "Текст материала достаточной длины.", scope: "COURSE", courseId: foreign.id })).rejects.toBeInstanceOf(KnowledgeError);
    await expect(createDoc(teacher, { title: "ТЕСТ на вуз", body: "Текст материала достаточной длины.", scope: "UNIVERSITY" })).rejects.toBeInstanceOf(KnowledgeError);
    await expect(createDoc(staff, { title: "ТЕСТ курс", body: "Текст материала достаточной длины.", scope: "COURSE", courseId: algoCourseId })).rejects.toBeInstanceOf(KnowledgeError);
    const ok = await createDoc(teacher, { title: "ТЕСТ своя", body: "Консультация\nПо четвергам в 15:00, ауд. 306.", scope: "COURSE", courseId: algoCourseId });
    expect((await getDoc(anna, ok.id))?.title).toBe("ТЕСТ своя");
  });

  it("сотрудник факультета — только материалы своего факультета (как с объявлениями)", () => {
    const fac = { id: "u", role: "STAFF" as const, student: null, teacher: null, staff: { id: "s", facultyId: "f1" } };
    expect(canEdit(fac, { authorId: "x", scope: "UNIVERSITY", facultyId: null })).toBe(false);
    expect(canEdit(fac, { authorId: "x", scope: "FACULTY", facultyId: "f2" })).toBe(false);
    expect(canEdit(fac, { authorId: "x", scope: "FACULTY", facultyId: "f1" })).toBe(true);
  });

  it("чужой материал не изменить и не удалить", async () => {
    const dean = await db.knowledgeDoc.findFirstOrThrow({ where: { scope: "UNIVERSITY" }, select: { id: true } });
    expect(await updateDoc(teacher, dean.id, { title: "ТЕСТ взлом", body: "Текст материала достаточной длины.", scope: "COURSE", courseId: algoCourseId })).toBeNull();
    expect(await deleteDoc(staff, teacherDocId)).toBe(false);
    expect(await deleteDoc(anna, dean.id)).toBe(false);
  });

  it("правка пересобирает фрагменты — помощник отвечает по новому тексту", async () => {
    const d = await createDoc(staff, { title: "ТЕСТ общежитие", body: "Заселение\nЗаселение в общежитие — с 25 августа.", scope: "UNIVERSITY" });
    await updateDoc(staff, d.id, { title: "ТЕСТ общежитие", body: "Заселение\nЗаселение в общежитие — с 28 августа, корпус Д.", scope: "UNIVERSITY" });
    const r = await libraryAnswer(anna, "когда заселение в общагу");
    expect(r?.text).toContain("28 августа");
  });
});

describe("помощник отвечает по библиотеке", () => {
  it("цитата и ссылка на источник; нет в библиотеке — null", async () => {
    const r = await libraryAnswer(anna, "Сколько раз можно пересдавать?");
    expect(r?.text).toContain("не более двух пересдач");
    expect(r?.links?.[0].href).toMatch(/^\/library\//);
    expect(await libraryAnswer(anna, "какая погода завтра в Москве")).toBeNull();
  });

  it("вопрос вне функций помощника уходит в библиотеку", async () => {
    const ctx = await buildStudentContext(anna.student!);
    const r = await reply([{ role: "user", content: "Когда работает деканат?" }], ctx);
    expect(r.text).toMatch(/10:00/);
    expect(r.links?.some((l) => l.href.startsWith("/library/"))).toBe(true);
  });

  it("к функции «справка для военкомата» добавляется ссылка на положение", async () => {
    const ctx = await buildStudentContext(anna.student!);
    const r = await reply([{ role: "user", content: "Нужна справка для военкомата" }], ctx);
    expect(r.draft).toBeTruthy();
    expect(r.links?.some((l) => l.label.startsWith("Подробнее"))).toBe(true);
  });
});
