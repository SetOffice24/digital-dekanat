/**
 * Помощник преподавателя и деканата: разбор фраз, черновики только в своей области, чаты не пересекаются.
 * Требует засеянную БД; ничего не выдаёт и не публикует (действия — только по кнопке, их проверяют другие тесты).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Staff, type Teacher, type User } from "@prisma/client";
import { parseDay, parseDue, findGroup } from "@/server/ai/common";
import { assignmentFromText, buildTeacherContext, rulesTeacher } from "@/server/ai/teacher";
import { announcementFromText, buildStaffContext, rulesStaff } from "@/server/ai/staff";
import { describeDraft } from "@/server/ai/drafts";
import { createChat, deleteChat, getChat, listChats } from "@/server/repos/assistant";
import { addDays, moscowToday } from "@/lib/utils";

const db = new PrismaClient();
let teacher: Teacher, teacherUser: User, staff: Staff, staffUser: User, outsider: Staff;

beforeAll(async () => {
  teacherUser = await db.user.findUniqueOrThrow({ where: { login: "teacher" } });
  teacher = await db.teacher.findFirstOrThrow({ where: { userId: teacherUser.id } });
  staffUser = await db.user.findUniqueOrThrow({ where: { login: "dekanat" } });
  staff = await db.staff.findFirstOrThrow({ where: { userId: staffUser.id } });
  const anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
  const other = await db.faculty.findFirstOrThrow({ where: { id: { not: anna.facultyId } } });
  outsider = { ...staff, facultyId: other.id };
});
afterAll(() => db.$disconnect());

describe("разбор фраз", () => {
  it("даты: завтра, день недели, «до 25.11», срок по умолчанию — через неделю в 23:59", () => {
    const today = moscowToday();
    expect(parseDay("пары завтра", today)?.getTime()).toBe(addDays(today, 1).getTime());
    const fri = parseDay("до пятницы", today)!;
    expect(fri.getUTCDay()).toBe(5);
    expect(fri > today).toBe(true);
    expect(parseDue("лабораторная").endsWith("T23:59")).toBe(true);
    expect(parseDue("лабораторная").slice(0, 10)).toBe(addDays(today, 7).toISOString().slice(0, 10));
  });

  it("группа в разных написаниях", () => {
    const groups = [{ name: "ИВТ-24-1" }, { name: "ИВТ-24-2" }];
    expect(findGroup("задай ивт 24 1 лабу", groups)?.name).toBe("ИВТ-24-1");
    expect(findGroup("для ИВТ-24-2", groups)?.name).toBe("ИВТ-24-2");
    expect(findGroup("для всех", groups)).toBeUndefined();
  });
});

describe("помощник преподавателя", () => {
  it("черновик задания: группа, дисциплина, «Лабораторная №6», описание после двоеточия", async () => {
    const ctx = await buildTeacherContext(teacher);
    const d = assignmentFromText("Задай ИВТ-24-1 по алгоритмам лабораторную №6 до пятницы: реализовать АВЛ-дерево", ctx);
    const pair = ctx.pairs.find((p) => p.groupId === d.groupId && p.courseId === d.courseId);
    expect(pair?.groupName).toBe("ИВТ-24-1");
    expect(pair?.courseName).toMatch(/Алгоритм/);
    expect(d.title).toBe("Лабораторная №6");
    expect(d.description).toBe("Реализовать АВЛ-дерево");
  });

  it("ответы на правилах не выдают задание сами — только черновик; оценки не ставит", async () => {
    const ctx = await buildTeacherContext(teacher);
    const before = await db.assignment.count({ where: { teacherId: teacher.id } });
    const r = await rulesTeacher("задай ИВТ-24-1 лабораторную №7", ctx);
    expect(r.draft?.kind).toBe("ASSIGNMENT");
    expect(await db.assignment.count({ where: { teacherId: teacher.id } })).toBe(before);
    expect((await rulesTeacher("что ты умеешь", ctx)).text).toMatch(/Оценки я не ставлю/);
  });

  it("карточка задания показывается только преподавателю и только с его парами", async () => {
    const draft = { kind: "ASSIGNMENT", groupId: "чужая", courseId: "чужая", title: "x", description: "", dueAt: "2030-01-01T23:59" };
    const card = await describeDraft(draft, { role: "TEACHER", teacher: { id: teacher.id } });
    expect(card?.kind).toBe("ASSIGNMENT");
    if (card?.kind === "ASSIGNMENT") expect(card.values.pair).toBe(""); // чужую пару не подставляем
    expect(await describeDraft(draft, { role: "STAFF", staff: { facultyId: null } })).toBeNull();
    expect(await describeDraft(draft, { role: "STUDENT" })).toBeNull();
  });
});

describe("помощник деканата", () => {
  it("черновик объявления: группа из фразы, текст после двоеточия", async () => {
    const ctx = await buildStaffContext(staff);
    const d = announcementFromText("Объяви ИВТ-24-1: лекция в понедельник переносится в 401", ctx);
    expect(d.audience).toBe("GROUP");
    expect(ctx.groups.find((g) => g.id === d.groupId)?.name).toBe("ИВТ-24-1");
    expect(d.body).toBe("Лекция в понедельник переносится в 401");
  });

  it("сотрудник факультета: в карточке только свои группы и нельзя «всем»", async () => {
    const draft = { kind: "ANNOUNCEMENT", audience: "ALL", groupId: "", title: "Тест", body: "Текст" };
    const card = await describeDraft(draft, { role: "STAFF", staff: { facultyId: outsider.facultyId } });
    expect(card?.kind).toBe("ANNOUNCEMENT");
    if (card?.kind === "ANNOUNCEMENT") {
      expect(card.canAll).toBe(false);
      expect(card.values.audience).toBe("FACULTY");
      const own = await db.group.count({ where: { program: { facultyId: outsider.facultyId! } } });
      expect(card.groups.length).toBe(own);
    }
  });

  it("поиск студента — только в своей области", async () => {
    const own = await rulesStaff("найди студента Леснова", await buildStaffContext(staff));
    expect(own.links?.length).toBeGreaterThan(0);
    const foreign = await rulesStaff("найди студента Леснова", await buildStaffContext(outsider));
    expect(foreign.links ?? []).toHaveLength(0);
  });
});

describe("чаты помощника не пересекаются между пользователями", () => {
  it("преподаватель не видит и не удаляет чат деканата", async () => {
    const chat = await createChat({ userId: staffUser.id }, "вопрос деканата");
    expect(await getChat({ userId: teacherUser.id }, chat.id)).toBeNull();
    expect((await listChats({ userId: teacherUser.id })).some((c) => c.id === chat.id)).toBe(false);
    expect(await deleteChat({ userId: teacherUser.id }, chat.id)).toBe(false);
    expect(await deleteChat({ userId: staffUser.id }, chat.id)).toBe(true);
  });
});

describe("новые сценарии помощника", () => {
  it("студент: «сдай лабораторную №5» — карточка сдачи этого задания; «по базам данных» — только эта дисциплина", async () => {
    const { buildStudentContext } = await import("@/server/ai/context");
    const { rulesReply } = await import("@/server/ai/assistant");
    const anna = await db.student.findFirstOrThrow({ where: { user: { login: "anna.lesnova" } } });
    const ctx = await buildStudentContext(anna);
    const sub = rulesReply("Сдай лабораторную №5", ctx);
    expect(sub.draft && "kind" in sub.draft && sub.draft.kind).toBe("SUBMISSION");
    const a = sub.draft && "kind" in sub.draft ? await db.assignment.findUniqueOrThrow({ where: { id: sub.draft.assignmentId } }) : null;
    expect(a?.title).toMatch(/№5/);
    expect(a?.groupId).toBe(anna.groupId);
    const g = rulesReply("Как у меня дела по базам данных", ctx);
    expect(g.text).toMatch(/Базы данных/);
    expect(g.text).not.toMatch(/Алгоритмы/);
    expect(rulesReply("Сколько я пропустил?", ctx).text).toMatch(/Посещаемость/);
  });

  it("преподаватель: однофамильцы — не угадываем; по имени — нужный студент; текст после «что»", async () => {
    const { messageFromText, buildTeacherContext: build } = await import("@/server/ai/teacher");
    const ctx = await build(teacher);
    const dup = ctx.students.filter((s) => s.lastName === "Зорин");
    if (dup.length > 1) expect(messageFromText("Напиши Зорину, что отчёт нужно доделать", ctx).studentUserId).toBe("");
    const nik = ctx.students.find((s) => s.lastName === "Зорин" && s.firstName === "Никита");
    if (nik) {
      const d = messageFromText("Напиши Никите Зорину, что отчёт нужно доделать", ctx);
      expect(d.studentUserId).toBe(nik.userId);
      expect(d.body).toBe("Отчёт нужно доделать");
    }
  });

  it("деканат: перенос — неоднозначную пару не подставляем; по дисциплине и дню — нужная пара", async () => {
    const { moveFromText } = await import("@/server/ai/staff");
    const ctx = await buildStaffContext(staff);
    const vague = await moveFromText("перенеси пару ИВТ-24-1 на понедельник 3 пару в ауд. 305", ctx);
    expect(vague?.lessonId).toBe("");
    expect(vague?.room).toBe("305");
    const group = ctx.groups.find((g) => g.name === "ИВТ-24-1")!;
    const next = await db.lesson.findFirst({ where: { groupId: group.id, status: { not: "CANCELLED" }, date: { gte: moscowToday() } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], include: { course: true } });
    if (next) {
      const sameCourseThatDay = await db.lesson.count({ where: { groupId: group.id, courseId: next.courseId, date: next.date, status: { not: "CANCELLED" } } });
      const day = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"][next.date.getUTCDay()];
      const d = await moveFromText(`перенеси пару ИВТ-24-1 по ${next.course.name.toLowerCase()} с ${day === "среду" ? "среды" : day} на пятницу 12:20 в 401`, ctx);
      if (sameCourseThatDay === 1 && next.date.getTime() > moscowToday().getTime()) expect(d?.lessonId).toBe(next.id);
      expect(d?.bell).toBe("12:20|13:50");
    }
    // чужой факультет не видит пары группы в карточке
    const card = await describeDraft({ kind: "MOVE", groupId: group.id, lessonId: "", date: "", bell: "", room: "", reason: "" }, { role: "STAFF", staff: { facultyId: outsider.facultyId } });
    expect(card?.kind === "MOVE" && card.lessons.length).toBe(0);
  });
});
