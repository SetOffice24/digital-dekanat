"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { clearAttempts, createSession, destroySession, dummyHash, homeFor, isRateLimited, registerFailedAttempt, verifyPassword } from "@/server/auth";

const schema = z.object({
  login: z.string().trim().min(1, "Введите логин").max(64),
  password: z.string().min(1, "Введите пароль").max(128),
});

export type LoginState = { error?: string; login?: string };

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ login: form.get("login"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, login: String(form.get("login") ?? "") };
  const { login, password } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  const key = `${login.toLowerCase()}|${ip}`;
  if (isRateLimited(key)) return { error: "Слишком много попыток. Подождите 15 минут и попробуйте снова.", login };

  const user = await prisma.user.findUnique({ where: { login: login.toLowerCase() } });
  // verify выполняется и для несуществующего логина — одинаковое время ответа
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
  if (!user || !ok) {
    registerFailedAttempt(key);
    return { error: "Неверный логин или пароль", login };
  }
  clearAttempts(key);
  await createSession(user.id);
  redirect(homeFor(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
