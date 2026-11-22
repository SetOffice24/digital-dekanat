/**
 * Повторный аудит безопасности (docs/audits/security-2026-11-22.md):
 * S01 демо-вход только явно в боевой сборке; S02 смена пароля без старого — только для временного;
 * S03 граница подгруппы преподавателя; S05 в БД — отпечаток токена сессии; S06 квота документов при параллельных загрузках.
 * Требует засеянную БД; за собой убирает.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";

// cookies/headers/redirect Next — подменяем: сессия хранится в объекте jar
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) }),
  headers: async () => new Map([["user-agent", "vitest"]]),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

const { createSession, demoLoginEnabled, sessionKey } = await import("@/server/auth");
const { changePasswordAction } = await import("@/app/login/actions");
const { addGrade, teachingScope, TeacherAccessError } = await import("@/server/repos/teacher");
const { uploadDocument } = await import("@/server/services/documents");

const db = new PrismaClient();
beforeEach(() => jar.clear());
afterAll(() => db.$disconnect());

describe("S01: демо-вход", () => {
  it("в боевой сборке — только при явном DEMO_LOGIN=1; при разработке — пока не выключен", () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = { NODE_ENV: env.NODE_ENV, DEMO_LOGIN: env.DEMO_LOGIN };
    try {
      env.NODE_ENV = "production";
      delete env.DEMO_LOGIN;
      expect(demoLoginEnabled()).toBe(false);
      env.DEMO_LOGIN = "yes";
      expect(demoLoginEnabled()).toBe(false);
      env.DEMO_LOGIN = "1";
      expect(demoLoginEnabled()).toBe(true);
      env.NODE_ENV = "development";
      delete env.DEMO_LOGIN;
      expect(demoLoginEnabled()).toBe(true);
      env.DEMO_LOGIN = "0";
      expect(demoLoginEnabled()).toBe(false);
    } finally {
      env.NODE_ENV = saved.NODE_ENV;
      if (saved.DEMO_LOGIN === undefined) delete env.DEMO_LOGIN;
      else env.DEMO_LOGIN = saved.DEMO_LOGIN;
    }
  });
});

describe("S05 и S02: сессии и смена пароля", () => {
  it("в БД — SHA-256 токена, сам токен только в cookie", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { login: "dekanat" } });
    await createSession(u.id);
    const token = jar.get("sid")!;
    expect(token).toBeTruthy();
    expect(await db.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await db.session.findUnique({ where: { id: sessionKey(token) } })).not.toBeNull();
    await db.session.deleteMany({ where: { id: sessionKey(token) } });
  });

  it("обычная сессия не меняет пароль без старого; временный — меняется, все сессии закрыты, выдана новая", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { login: "dekanat" } });
    const form = new FormData();
    form.set("password", "Audit-new-pass-123");
    form.set("repeat", "Audit-new-pass-123");
    await createSession(u.id);
    await expect(changePasswordAction({}, form)).rejects.toThrow(/REDIRECT:\/staff/);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash).toBe(u.passwordHash);

    // временный пароль: смена проходит, старая сессия удалена, cookie — новый токен
    await db.user.update({ where: { id: u.id }, data: { mustChangePassword: true } });
    const old = jar.get("sid")!;
    try {
      await expect(changePasswordAction({}, form)).rejects.toThrow(/REDIRECT:\/staff/);
      const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(after.passwordHash).not.toBe(u.passwordHash);
      expect(after.mustChangePassword).toBe(false);
      expect(await db.session.findUnique({ where: { id: sessionKey(old) } })).toBeNull();
      expect(jar.get("sid")).not.toBe(old);
    } finally {
      await db.user.update({ where: { id: u.id }, data: { passwordHash: u.passwordHash, mustChangePassword: false } });
      await db.session.deleteMany({ where: { userId: u.id } });
    }
  });
});

describe("S03: граница подгруппы", () => {
  it("преподаватель только одной подгруппы не ставит оценку студенту другой", async () => {
    // пара (преподаватель, группа, дисциплина), где у преподавателя только занятия подгруппы
    const since = new Date(Date.now() - 150 * 86400_000);
    const subLessons = await db.lesson.findMany({ where: { subgroup: { not: null }, date: { gte: since } }, distinct: ["teacherId", "groupId", "courseId"], select: { teacherId: true, groupId: true, courseId: true, subgroup: true } });
    let found: (typeof subLessons)[number] | null = null;
    for (const l of subLessons) {
      const wholeGroup = await db.lesson.count({ where: { teacherId: l.teacherId, groupId: l.groupId, courseId: l.courseId, subgroup: null, date: { gte: since } } });
      const otherSub = await db.lesson.count({ where: { teacherId: l.teacherId, groupId: l.groupId, courseId: l.courseId, subgroup: { not: l.subgroup }, date: { gte: since } } });
      if (!wholeGroup && !otherSub) {
        found = l;
        break;
      }
    }
    // сид обязан содержать такую пару: без неё сценарий S03 не проверяется — тест должен упасть, а не пройти молча
    expect(found, "в сиде нет преподавателя, который ведёт только одну подгруппу").toBeTruthy();
    if (!found) return;
    const scope = await teachingScope({ id: found.teacherId }, found.groupId, found.courseId);
    expect(scope).toEqual({ all: false, subgroups: [found.subgroup] });
    const group = await db.group.findUniqueOrThrow({ where: { id: found.groupId }, select: { course: true } });
    const other = await db.enrollment.findFirst({ where: { courseId: found.courseId, semester: group.course * 2 - 1, student: { groupId: found.groupId, subgroup: { not: found.subgroup! } } }, select: { id: true } });
    expect(other, "в сиде нет зачисления студента другой подгруппы").toBeTruthy();
    if (!other) return;
    await expect(addGrade({ id: found.teacherId }, other.id, 10, "Проверка")).rejects.toBeInstanceOf(TeacherAccessError);
  });
});

describe("S06: квота документов", () => {
  it("две параллельные загрузки на последнем свободном месте — проходит одна", async () => {
    const s = await db.student.findFirstOrThrow({ where: { user: { login: "petr.ozerov" } } });
    const have = await db.studentDocument.count({ where: { studentId: s.id } });
    // добиваем до 29 документов фиктивными строками (без файлов)
    const fillers = await Promise.all(
      Array.from({ length: Math.max(0, 29 - have) }, (_, i) => db.studentDocument.create({ data: { studentId: s.id, kind: "OTHER", fileName: `ТЕСТ-${i}.pdf`, mime: "application/pdf", size: 10, storageKey: `test-quota-${Date.now()}-${i}` } })),
    );
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#cccccc" } }).png().toBuffer();
    const made: string[] = [];
    try {
      const res = await Promise.allSettled([uploadDocument(s, "OTHER", new File([new Uint8Array(png)], "a.png")), uploadDocument(s, "OTHER", new File([new Uint8Array(png)], "b.png"))]);
      for (const r of res) if (r.status === "fulfilled") made.push(r.value.id);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.studentDocument.count({ where: { studentId: s.id } })).toBe(30);
    } finally {
      const real = await db.studentDocument.findMany({ where: { id: { in: made } }, select: { storageKey: true } });
      for (const r of real) await unlink(path.join(process.env.DATA_DIR || "./data", "documents", r.storageKey)).catch(() => {});
      await db.studentDocument.deleteMany({ where: { id: { in: [...fillers.map((f) => f.id), ...made] } } });
    }
  });
});
