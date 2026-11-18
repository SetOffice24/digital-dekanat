/**
 * Сообщения: кто кому может писать, кто видит диалог и вложения. Требует засеянную БД; создаёт и удаляет свои диалоги.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { openConversation, replyToConversation, setConversationStatus, startConversation, unreadConversations, viewerOf, type Viewer } from "@/server/repos/messages";
import { canAccessAttachment } from "@/server/files";
import fs from "node:fs/promises";
import path from "node:path";

const db = new PrismaClient();
const created: string[] = [];
let anna: Viewer, petr: Viewer, teacher: Viewer, staff: Viewer, classmate: Viewer, outsiderStaff: Viewer, facultyStaff: Viewer;

const load = async (login: string) => viewerOf(await db.user.findUniqueOrThrow({ where: { login }, include: { student: true, staff: true, teacher: true } }));
const pdf = (name = "вопрос.pdf") => new File(["%PDF-1.4 test"], name, { type: "application/pdf" });

beforeAll(async () => {
  [anna, petr, teacher, staff] = await Promise.all(["anna.lesnova", "petr.ozerov", "teacher", "dekanat"].map(load));
  const mate = await db.student.findFirstOrThrow({ where: { groupId: anna.student!.groupId, id: { not: anna.student!.id } }, include: { user: true } });
  classmate = await load(mate.user.login);
  const other = await db.faculty.findFirstOrThrow({ where: { id: { not: anna.student!.facultyId } } });
  outsiderStaff = { ...staff, staff: { id: staff.staff!.id, facultyId: other.id } };
  facultyStaff = { ...staff, staff: { id: staff.staff!.id, facultyId: anna.student!.facultyId } };
});
afterAll(async () => {
  // файлы вложений — с диска, иначе каскадное удаление БД оставит их сиротами
  const keys = await db.attachment.findMany({ where: { message: { conversationId: { in: created } } }, select: { storageKey: true } });
  await Promise.all(keys.map((k) => fs.unlink(path.join(process.env.DATA_DIR || "./data", "uploads", k.storageKey)).catch(() => {})));
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

describe("деканат факультета и преподаватели", () => {
  it("преподаватель → деканат: обращение уходит факультету его групп; сотрудник факультета видит, другого — нет", async () => {
    const c = track(await startConversation(teacher, { to: "deanery", subject: "Аудитория", body: "Нужна аудитория с проектором", files: [] }));
    expect(c.facultyId).toBe(anna.student!.facultyId);
    expect(await openConversation(facultyStaff, c.id)).not.toBeNull();
    expect(await openConversation(outsiderStaff, c.id)).toBeNull();
  });

  it("сотрудник факультета пишет преподавателю — видит свою тему и ответ; чужой факультет писать этому преподавателю не может", async () => {
    const c = track(await startConversation(facultyStaff, { to: teacher.id, subject: "Перенос", body: "Можно перенести пару?", files: [] }));
    expect(c.facultyId).toBe(anna.student!.facultyId);
    await replyToConversation(teacher, c.id, { body: "Да, можно", files: [] });
    expect((await openConversation(facultyStaff, c.id))?.conversation.messages.length).toBe(2);
    await expect(startConversation(outsiderStaff, { to: teacher.id, subject: "?", body: "?", files: [] })).rejects.toThrow(/факультете/);
  });
});

describe("повод должен относиться к адресату", () => {
  it("дисциплина, которую выбранный преподаватель не ведёт, — отказ; заявка в личном диалоге с преподавателем — отказ", async () => {
    const other = await db.lesson.findFirst({ where: { groupId: anna.student!.groupId, teacherId: { not: teacher.teacher!.id } }, select: { courseId: true } });
    const own = await db.lesson.findFirstOrThrow({ where: { groupId: anna.student!.groupId, teacherId: teacher.teacher!.id }, select: { courseId: true } });
    if (other && other.courseId !== own.courseId) {
      const taughtByTeacher = await db.lesson.count({ where: { teacherId: teacher.teacher!.id, courseId: other.courseId, groupId: anna.student!.groupId } });
      if (!taughtByTeacher) await expect(startConversation(anna, { to: teacher.id, subject: "?", body: "?", files: [], context: { type: "COURSE", id: other.courseId } })).rejects.toThrow(/не относится/);
    }
    track(await startConversation(anna, { to: teacher.id, subject: "По дисциплине", body: "?", files: [], context: { type: "COURSE", id: own.courseId } }));
    const req = await db.request.findFirstOrThrow({ where: { studentId: anna.student!.id } });
    await expect(startConversation(anna, { to: teacher.id, subject: "?", body: "?", files: [], context: { type: "REQUEST", id: req.id } })).rejects.toThrow(/не относится/);
  });
});

describe("надёжность отправки", () => {
  it("повтор с тем же ключом не создаёт второй диалог и второе сообщение", async () => {
    const key = `test-${Date.now()}`;
    const a = track(await startConversation(anna, { to: "deanery", subject: "Повтор", body: "Один раз", files: [], clientKey: key }));
    const b = await startConversation(anna, { to: "deanery", subject: "Повтор", body: "Один раз", files: [], clientKey: key });
    expect(b.id).toBe(a.id);
    const rk = `reply-${Date.now()}`;
    await replyToConversation(anna, a.id, { body: "Ещё", files: [], clientKey: rk });
    await replyToConversation(anna, a.id, { body: "Ещё", files: [], clientKey: rk });
    expect(await db.message.count({ where: { conversationId: a.id } })).toBe(2);
  });

  it("слишком длинный текст — понятная ошибка, а не молчаливое обрезание", async () => {
    await expect(startConversation(anna, { to: "deanery", subject: "Длинно", body: "а".repeat(4001), files: [] })).rejects.toThrow(/4000/);
  });

  it("счётчик непрочитанных считается по всей базе и гаснет после открытия", async () => {
    const c = track(await startConversation(staff, { to: anna.id, subject: "Счётчик", body: "Проверка", files: [] }));
    const before = await unreadConversations(anna);
    expect(before).toBeGreaterThan(0);
    await openConversation(anna, c.id);
    expect(await unreadConversations(anna)).toBe(before - 1);
  });
});
