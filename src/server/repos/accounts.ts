import "server-only";
/**
 * Управление аккаунтами студентов для деканата: статистика, блокировка, временный пароль, перевод, создание.
 * Только студенты своего факультета (сотрудник без факультета — все). Каждое действие пишется в журнал AccountEvent;
 * пароли в журнал не попадают. Чужой студент или группа → null / AccountError.
 */
import { randomBytes } from "node:crypto";
import type { AccountAction, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { clearAttemptsForLogin, hashPassword } from "../auth";
import { notify } from "../notify";
import { newIdCode } from "../photos";
import { studentScope, type SessionStaff } from "./staff";

export class AccountError extends Error {}

const DAY = 86400_000;
const semesterOf = (course: number) => course * 2 - 1;
const groupScope = (s: SessionStaff): Prisma.GroupWhereInput => (s.facultyId ? { program: { facultyId: s.facultyId } } : {});

/* ---------------- статистика и список ---------------- */

export type AccountFilter = "blocked" | "temp" | "never" | "inactive" | "nophoto";
export const ACCOUNT_FILTERS: { key: AccountFilter; label: string; hint: string }[] = [
  { key: "never", label: "Ни разу не входили", hint: "Выдайте логин и пароль или сбросьте пароль" },
  { key: "inactive", label: "Не заходили 14 дней", hint: "Возможно, пропустили уведомления и сроки" },
  { key: "temp", label: "Ждут смены пароля", hint: "Получили временный пароль, но ещё не вошли" },
  { key: "blocked", label: "Заблокированы", hint: "Вход закрыт деканатом" },
  { key: "nophoto", label: "Без фото", hint: "Нет принятого фото для пропуска" },
];

function filterWhere(f: AccountFilter | undefined, now: Date): Prisma.StudentWhereInput {
  switch (f) {
    case "blocked":
      return { user: { blockedAt: { not: null } } };
    case "temp":
      return { user: { mustChangePassword: true, blockedAt: null } };
    case "never":
      return { user: { lastLoginAt: null, blockedAt: null } };
    case "inactive":
      return { user: { lastLoginAt: { lt: new Date(now.getTime() - 14 * DAY) }, blockedAt: null } };
    case "nophoto":
      return { photos: { none: { status: "APPROVED" } } };
    default:
      return {};
  }
}

/** Сводка по аккаунтам в области сотрудника (или одной группе) + список с фильтром и поиском. */
export async function accountsOverview(staff: SessionStaff, opts: { groupId?: string; filter?: AccountFilter; q?: string }) {
  const now = new Date();
  const base: Prisma.StudentWhereInput = { ...studentScope(staff), ...(opts.groupId ? { groupId: opts.groupId } : {}) };
  const count = (w: Prisma.StudentWhereInput) => prisma.student.count({ where: { ...base, ...w } });
  const [total, active7, never, inactive, temp, blocked, nophoto] = await Promise.all([
    count({}),
    count({ user: { lastLoginAt: { gte: new Date(now.getTime() - 7 * DAY) }, blockedAt: null } }),
    count(filterWhere("never", now)),
    count(filterWhere("inactive", now)),
    count(filterWhere("temp", now)),
    count(filterWhere("blocked", now)),
    count(filterWhere("nophoto", now)),
  ]);
  const q = opts.q?.trim().slice(0, 60);
  const words = q ? q.split(/\s+/).filter(Boolean) : [];
  const rows = await prisma.student.findMany({
    where: {
      ...base,
      ...filterWhere(opts.filter, now),
      AND: words.map((w) => ({ OR: [{ lastName: { contains: w, mode: "insensitive" as const } }, { firstName: { contains: w, mode: "insensitive" as const } }, { user: { login: { contains: w.toLowerCase() } } }, { recordBookNo: { contains: w } }] })),
    },
    orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
    take: 200,
    select: {
      id: true, lastName: true, firstName: true, middleName: true,
      group: { select: { name: true } },
      user: { select: { login: true, blockedAt: true, mustChangePassword: true, lastLoginAt: true } },
      photos: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
    },
  });
  const staleBefore = now.getTime() - 14 * DAY;
  return { stats: { total, active7, never, inactive, temp, blocked, nophoto }, rows: rows.map((r) => ({ ...r, stale: Boolean(r.user.lastLoginAt && r.user.lastLoginAt.getTime() < staleBefore) })) };
}

/** Последние действия с аккаунтами в области сотрудника. */
export function recentAccountEvents(staff: SessionStaff, take = 12) {
  return prisma.accountEvent.findMany({
    where: { student: studentScope(staff) },
    orderBy: { createdAt: "desc" },
    take,
    select: eventSelect,
  });
}

const eventSelect = {
  id: true, action: true, details: true, createdAt: true,
  student: { select: { id: true, lastName: true, firstName: true } },
  actor: { select: { login: true, staff: { select: { fullName: true } }, student: { select: { lastName: true, firstName: true } } } },
} as const;

/* ---------------- аккаунт одного студента ---------------- */

/** Аккаунт в личном деле: статус, последний вход, устройства, журнал. Чужой факультет → null. */
export async function studentAccount(staff: SessionStaff, studentId: string) {
  const s = await prisma.student.findFirst({
    where: { id: studentId, ...studentScope(staff) },
    select: {
      id: true, subgroup: true, groupId: true,
      user: { select: { login: true, blockedAt: true, blockReason: true, mustChangePassword: true, lastLoginAt: true, createdAt: true, _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } }, pushSubs: true } } } },
    },
  });
  if (!s) return null;
  const events = await prisma.accountEvent.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 20, select: eventSelect });
  return { ...s, events };
}

async function loadInScope(staff: SessionStaff, studentId: string) {
  const s = await prisma.student.findFirst({
    where: { id: studentId, ...studentScope(staff) },
    select: { id: true, userId: true, groupId: true, subgroup: true, course: true, lastName: true, firstName: true, group: { select: { name: true } }, user: { select: { blockedAt: true } } },
  });
  if (!s) throw new AccountError("Студент не найден");
  return s;
}

const log = (tx: Prisma.TransactionClient, studentId: string, actorUserId: string, action: AccountAction, details?: string | null) =>
  tx.accountEvent.create({ data: { studentId, actorUserId, action, details: details ?? null } });

/** Заблокировать: вход закрыт сразу — сессии и push-подписки удаляются. Данные студента не трогаем. */
export async function blockStudent(staff: SessionStaff, studentId: string, reason: string) {
  const s = await loadInScope(staff, studentId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: s.userId, blockedAt: null }, data: { blockedAt: new Date(), blockReason: reason } });
    if (!count) throw new AccountError("Аккаунт уже заблокирован");
    await tx.session.deleteMany({ where: { userId: s.userId } });
    await tx.pushSubscription.deleteMany({ where: { userId: s.userId } });
    await log(tx, s.id, staff.userId, "BLOCKED", reason);
  });
}

export async function unblockStudent(staff: SessionStaff, studentId: string) {
  const s = await loadInScope(staff, studentId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: s.userId, blockedAt: { not: null } }, data: { blockedAt: null, blockReason: null } });
    if (!count) throw new AccountError("Аккаунт не заблокирован");
    await log(tx, s.id, staff.userId, "UNBLOCKED");
  });
  await safeNotify([s.userId], { title: "Доступ к кабинету восстановлен", body: "Деканат снял блокировку — можно входить как обычно.", link: "/" });
}

/** Временный пароль: читаемый, без похожих символов. Показывается сотруднику один раз и нигде не хранится. */
export function tempPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const s = Array.from(randomBytes(10), (b) => abc[b % abc.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Сбросить пароль: выдать временный; все сессии закрываются, при входе студент обязан задать свой. */
export async function resetPassword(staff: SessionStaff, studentId: string) {
  const s = await loadInScope(staff, studentId);
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: s.userId }, data: { passwordHash, mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: s.userId } });
    await log(tx, s.id, staff.userId, "PASSWORD_RESET");
  });
  const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { login: true } });
  if (u) clearAttemptsForLogin(u.login);
  return password;
}

/* ---------------- перевод ---------------- */

/** Дисциплины текущего семестра группы — по зачислениям её студентов, а если их нет — по парам. */
async function curriculum(tx: Prisma.TransactionClient, groupId: string, semester: number, excludeStudentId?: string) {
  const enr = await tx.enrollment.findMany({ where: { semester, student: { groupId, ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}) } }, distinct: ["courseId"], select: { courseId: true } });
  if (enr.length) return enr.map((e) => e.courseId);
  const lessons = await tx.lesson.findMany({ where: { groupId }, distinct: ["courseId"], select: { courseId: true } });
  return lessons.map((l) => l.courseId);
}

/**
 * Перевести в другую группу (или подгруппу).
 * - История остаётся: оценки и зачисления прошлых семестров, посещаемость прошлых пар, сданные ДЗ (видны и студенту, и преподавателю).
 * - Текущий семестр: дисциплины новой группы добавляются; совпадающие дисциплины сохраняют оценки;
 *   пустые зачисления старой группы (без оценок) убираются, с оценками — остаются как «разница в планах».
 * - Расписание, задания, материалы, сообщения, студенческий — сразу по новой группе.
 */
export async function transferStudent(staff: SessionStaff, studentId: string, groupId: string, subgroup: number) {
  const s = await loadInScope(staff, studentId);
  const g = await prisma.group.findFirst({ where: { id: groupId, ...groupScope(staff) }, select: { id: true, name: true, course: true, programId: true, program: { select: { facultyId: true } } } });
  if (!g) throw new AccountError("Группа не найдена");
  if (![1, 2].includes(subgroup)) throw new AccountError("Подгруппа — 1 или 2");
  if (g.id === s.groupId && subgroup === s.subgroup) throw new AccountError("Студент уже в этой группе и подгруппе");
  const sameGroup = g.id === s.groupId;
  const details = sameGroup ? `Подгруппа ${s.subgroup} → ${subgroup}` : `${s.group.name}, подгр. ${s.subgroup} → ${g.name}, подгр. ${subgroup}`;

  await prisma.$transaction(async (tx) => {
    // условие на прежнюю группу: два одновременных перевода не наложатся
    const { count } = await tx.student.updateMany({
      where: { id: s.id, groupId: s.groupId, subgroup: s.subgroup },
      data: { groupId: g.id, subgroup, course: g.course, programId: g.programId, facultyId: g.program.facultyId },
    });
    if (!count) throw new AccountError("Данные студента только что изменились — обновите страницу");
    if (!sameGroup) {
      const sem = semesterOf(g.course);
      const plan = await curriculum(tx, g.id, sem, s.id);
      const have = await tx.enrollment.findMany({ where: { studentId: s.id, semester: sem }, select: { id: true, courseId: true, _count: { select: { grades: true } } } });
      const haveIds = new Set(have.map((e) => e.courseId));
      await tx.enrollment.createMany({ data: plan.filter((c) => !haveIds.has(c)).map((courseId) => ({ studentId: s.id, courseId, semester: sem })) });
      const planSet = new Set(plan);
      const empty = have.filter((e) => !planSet.has(e.courseId) && e._count.grades === 0).map((e) => e.id);
      if (empty.length) await tx.enrollment.deleteMany({ where: { id: { in: empty } } });
      // пустые зачисления текущего семестра старой группы (если курс другой)
      const oldSem = semesterOf(s.course);
      if (oldSem !== sem) await tx.enrollment.deleteMany({ where: { studentId: s.id, semester: oldSem, grades: { none: {} } } });
    }
    await log(tx, s.id, staff.userId, "TRANSFERRED", details);
  });
  await safeNotify([s.userId], {
    title: sameGroup ? `Вы переведены в подгруппу ${subgroup}` : `Вы переведены в группу ${g.name}`,
    body: sameGroup ? "Расписание уже обновлено." : `Расписание, задания и материалы — уже по группе ${g.name}. Оценки и сданные работы сохранены.`,
    link: "/schedule",
  });
  return details;
}

/* ---------------- создание ---------------- */

const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
export const translit = (s: string) => [...s.toLowerCase()].map((c) => TR[c] ?? (/[a-z0-9]/.test(c) ? c : "")).join("");

/** Логин «имя.фамилия», при совпадении — с цифрой: anna.lesnova2. */
async function freeLogin(firstName: string, lastName: string) {
  const base = `${translit(firstName)}.${translit(lastName)}`.replace(/^\.|\.$/g, "").slice(0, 40) || "student";
  for (let i = 1; i < 100; i++) {
    const login = i === 1 ? base : `${base}${i}`;
    if (!(await prisma.user.count({ where: { login } }))) return login;
  }
  throw new AccountError("Не удалось подобрать логин");
}

export type NewStudent = { lastName: string; firstName: string; middleName?: string | null; groupId: string; subgroup: number; recordBookNo: string; email?: string | null };

/** Создать студента: аккаунт с временным паролем, зачисление на дисциплины группы, код студенческого. */
export async function createStudent(staff: SessionStaff, d: NewStudent) {
  const g = await prisma.group.findFirst({ where: { id: d.groupId, ...groupScope(staff) }, select: { id: true, name: true, course: true, programId: true, program: { select: { facultyId: true } } } });
  if (!g) throw new AccountError("Группа не найдена");
  if (await prisma.student.count({ where: { recordBookNo: d.recordBookNo } })) throw new AccountError(`Зачётка № ${d.recordBookNo} уже есть у другого студента`);
  const login = await freeLogin(d.firstName, d.lastName);
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  const student = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { login, passwordHash, role: "STUDENT", mustChangePassword: true } });
    const st = await tx.student.create({
      data: {
        userId: user.id, lastName: d.lastName, firstName: d.firstName, middleName: d.middleName || null, recordBookNo: d.recordBookNo, email: d.email || null,
        groupId: g.id, subgroup: d.subgroup, course: g.course, programId: g.programId, facultyId: g.program.facultyId, idCode: newIdCode(),
      },
    });
    const sem = semesterOf(g.course);
    const plan = await curriculum(tx, g.id, sem, st.id);
    await tx.enrollment.createMany({ data: plan.map((courseId) => ({ studentId: st.id, courseId, semester: sem })) });
    await log(tx, st.id, staff.userId, "CREATED", `${g.name}, подгр. ${d.subgroup}`);
    return st;
  });
  return { studentId: student.id, login, password, group: g.name };
}

async function safeNotify(userIds: string[], n: { title: string; body: string; link: string }) {
  try {
    await notify(userIds, { kind: "SYSTEM", ...n });
  } catch (e) {
    console.error("notify failed", e);
  }
}

export const ACTION_LABEL: Record<AccountAction, string> = {
  CREATED: "Аккаунт создан",
  BLOCKED: "Заблокирован",
  UNBLOCKED: "Разблокирован",
  PASSWORD_RESET: "Выдан временный пароль",
  PASSWORD_CHANGED: "Студент задал свой пароль",
  TRANSFERRED: "Перевод",
};
