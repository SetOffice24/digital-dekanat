import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { cache } from "react";
import { prisma } from "./db";

const COOKIE = "sid";
const SESSION_DAYS = 30;
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, ARGON);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Хэш-заглушка: проверка пароля для несуществующего логина занимает столько же времени. */
let dummy: Promise<string> | null = null;
export function dummyHash() {
  return (dummy ??= hashPassword("timing-equalizer-not-a-real-password"));
}

/* ---------- лимит попыток входа (в памяти процесса) ---------- */
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function isRateLimited(key: string) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() > a.until) {
    attempts.delete(key);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() > a.until) attempts.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  else a.count++;
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

/* ---------- сессии ---------- */
export async function createSession(userId: string) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await prisma.session.create({ data: { id, userId, expiresAt, userAgent: ua } });
  const secure = (process.env.APP_URL ?? "").startsWith("https://");
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await prisma.session.deleteMany({ where: { id } });
  jar.delete(COOKIE);
}

/** Текущий пользователь (кэшируется на время одного запроса). */
export const getCurrentUser = cache(async () => {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { student: true, staff: true, teacher: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** Для страниц и действий студента. Студент берётся ТОЛЬКО из сессии. */
export async function requireStudent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT" || !user.student) redirect(homeFor(user.role));
  return { user, student: user.student };
}

/** Стартовая страница для роли. */
export function homeFor(role: "STUDENT" | "STAFF" | "TEACHER") {
  return role === "STAFF" ? "/staff" : role === "TEACHER" ? "/teacher" : "/";
}

/** Для страниц и действий преподавателя: преподаватель берётся только из сессии. */
export async function requireTeacher() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TEACHER" || !user.teacher) redirect("/forbidden");
  return { user, teacher: user.teacher };
}

/** Для страниц и действий сотрудника деканата. */
export async function requireStaff() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STAFF" || !user.staff) redirect("/forbidden");
  return { user, staff: user.staff };
}

/** Для API-маршрутов: без редиректов, возвращает null. */
export async function apiStudent() {
  const user = await getCurrentUser();
  if (!user || user.role !== "STUDENT" || !user.student) return null;
  return { user, student: user.student };
}
