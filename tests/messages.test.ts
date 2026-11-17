/**
 * Сообщения: кто кому может писать, кто видит диалог и вложения. Требует засеянную БД; создаёт и удаляет свои диалоги.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { openConversation, replyToConversation, setConversationStatus, startConversation, unreadConversations, viewerOf, type Viewer } from "@/server/repos/messages";
import { canAccessAttachment } from "@/server/files";

const db = new PrismaClient();
const created: string[] = [];
let anna: Viewer, petr: Viewer, teacher: Viewer, staff: Viewer, classmate: Viewer, outsiderStaff: Viewer;

const load = async (login: string) => viewerOf(await db.user.findUniqueOrThrow({ where: { login }, include: { student: true, staff: true, teacher: true } }));
const pdf = (name = "вопрос.pdf") => new File(["%PDF-1.4 test"], name, { type: "application/pdf" });

beforeAll(async () => {
  [anna, petr, teacher, staff] = await Promise.all(["anna.lesnova", "petr.ozerov", "teacher", "dekanat"].map(load));
  const mate = await db.student.findFirstOrThrow({ where: { groupId: anna.student!.groupId, id: { not: anna.student!.id } }, include: { user: true } });
  classmate = await load(mate.user.login);
  const other = await db.faculty.findFirstOrThrow({ where: { id: { not: anna.student!.facultyId } } });
  outsiderStaff = { ...staff, staff: { id: staff.staff!.id, facultyId: other.id } };
});
afterAll(async () => {
  await db.conversation.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});
const track = <T extends { id: string }>(c: T) => (created.push(c.id), c);

describe("кто кому может писать", () => {
  it("студент → преподаватель своей группы — можно; чужой группы — нельзя; студент → студент — нельзя", async () => {
    const c = track(await startConversation(anna, { to: teacher.id, subject: "Вопрос", body: "Здравствуйте", files: [] }));
    expect(c.kind).toBe("DIRECT");
    await expect(startConversation(petr, { to: teacher.id, subject: "Вопрос", body: "Здравствуйте", files: [] })).rejects.toThrow();
    await expect(startConversation(anna, { to: classmate.id, subject: "Привет", body: "!", files: [] })).rejects.toThrow();
  });

  it("преподаватель → студент своей группы — можно, чужой — нельзя", async () => {
    track(await startConversation(teacher, { to: anna.id, subject: "Отчёт", body: "Добавьте замеры", files: [] }));
    await expect(startConversation(teacher, { to: petr.id, subject: "Отчёт", body: "?", files: [] })).rejects.toThrow();
  });

  it("чужой повод (заявка другого студента) — отказ", async () => {
    const petrRequest = await db.request.findFirstOrThrow({ where: { studentId: petr.student!.id } });
    await expect(startConversation(anna, { to: "deanery", subject: "Вопрос", body: "?", files: [], context: { type: "REQUEST", id: petrRequest.id } })).rejects.toThrow();
  });
});

describe("кто видит обращение в деканат", () => {
  it("деканат своего факультета видит и отвечает; другого факультета — нет; одногруппник — нет", async () => {
    const c = track(await startConversation(anna, { to: "deanery", subject: "Справка", body: "Нужна справка", files: [pdf()] }));
    expect(await openConversation(staff, c.id)).not.toBeNull();
    expect(await openConversation(outsiderStaff, c.id)).toBeNull();
    expect(await openConversation(classmate, c.id)).toBeNull();
    await expect(replyToConversation(classmate, c.id, { body: "взлом", files: [] })).rejects.toThrow();
    await replyToConversation(staff, c.id, { body: "Готовим", files: [] });
    expect(await unreadConversations(anna)).toBeGreaterThan(0);
  });

  it("«решено» ставит только деканат; ответ студента открывает обращение снова", async () => {
    const c = track(await startConversation(anna, { to: "deanery", subject: "Ещё вопрос", body: "?", files: [] }));
    expect(await setConversationStatus(anna, c.id, "RESOLVED")).toBe(false);
    expect(await setConversationStatus(outsiderStaff, c.id, "RESOLVED")).toBe(false);
    expect(await setConversationStatus(staff, c.id, "RESOLVED")).toBe(true);
    await replyToConversation(anna, c.id, { body: "Остался вопрос", files: [] });
    expect((await db.conversation.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("OPEN");
  });
});

describe("вложения в сообщениях", () => {
  it("скачать могут участники и деканат своего факультета; одногруппник и деканат личного диалога — нет", async () => {
    const deanery = track(await startConversation(anna, { to: "deanery", subject: "Файл", body: "см. файл", files: [pdf("справка.pdf")] }));
    const fileD = await db.attachment.findFirstOrThrow({ where: { message: { conversationId: deanery.id } } });
    const u = (v: Viewer) => ({ id: v.id, role: v.role, student: v.student, teacher: v.teacher, staff: v.staff });
    expect(await canAccessAttachment(u(anna), fileD.id)).not.toBeNull();
    expect(await canAccessAttachment(u(staff), fileD.id)).not.toBeNull();
    expect(await canAccessAttachment(u(outsiderStaff), fileD.id)).toBeNull();
    expect(await canAccessAttachment(u(classmate), fileD.id)).toBeNull();

    const direct = track(await startConversation(anna, { to: teacher.id, subject: "Файл", body: "отчёт", files: [pdf("отчёт.pdf")] }));
    const fileT = await db.attachment.findFirstOrThrow({ where: { message: { conversationId: direct.id } } });
    expect(await canAccessAttachment(u(teacher), fileT.id)).not.toBeNull();
    expect(await canAccessAttachment(u(staff), fileT.id)).toBeNull();
    expect(await canAccessAttachment(u(petr), fileT.id)).toBeNull();
  });

  it("неподходящий формат файла — отказ", async () => {
    await expect(startConversation(anna, { to: "deanery", subject: "x", body: "x", files: [new File(["x"], "a.exe")] })).rejects.toThrow();
  });
});
