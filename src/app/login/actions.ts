"use server";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { clearAttempts, createSession, destroySession, dummyHash, hashPassword, homeFor, isRateLimited, registerFailedAttempt, userForPasswordChange, verifyPassword } from "@/server/auth";

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
  // первый адрес в X-Forwarded-For задаёт клиент (можно подделать и обойти лимит); последний дописывает наш Caddy
  const ip = h.get("x-forwarded-for")?.split(",").pop()?.trim() || h.get("x-real-ip") || "local";
  const key = `${login.toLowerCase()}|${ip}`;
  const ipKey = `ip|${ip}`;
  if (isRateLimited(key) || isRateLimited(ipKey, 50)) return { error: "Слишком много попыток. Подождите 15 минут и попробуйте снова.", login };

  const user = await prisma.user.findUnique({ where: { login: login.toLowerCase() } });
  // verify выполняется и для несуществующего логина — одинаковое время ответа
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
  if (!user || !ok) {
    registerFailedAttempt(key);
    registerFailedAttempt(ipKey); // перебор разных логинов с одного адреса
    return { error: "Неверный логин или пароль", login };
  }
  clearAttempts(key);
  // о блокировке говорим только после верного пароля — иначе по ответу можно узнать, что логин существует
  if (user.blockedAt) return { error: "Аккаунт заблокирован. Обратитесь в деканат: каб. 204, главный корпус.", login };
  await createSession(user.id);
  redirect(user.mustChangePassword ? "/change-password" : homeFor(user.role));
}

/** Демо-доступ для жюри: вход в один из четырёх вымышленных аккаунтов без ввода пароля.
 *  Список логинов жёстко ограничен; на сервере можно выключить через DEMO_LOGIN=0. */
const DEMO_LOGINS = ["anna.lesnova", "petr.ozerov", "dekanat", "teacher"] as const;

export async function demoLoginAction(form: FormData) {
  if (process.env.DEMO_LOGIN === "0") redirect("/login");
  const login = String(form.get("login") ?? "");
  if (!(DEMO_LOGINS as readonly string[]).includes(login)) redirect("/login");
  const user = await prisma.user.findUnique({ where: { login } });
  if (!user || user.blockedAt) redirect("/login");
  await createSession(user.id);
  redirect(homeFor(user.role));
}

const newPassword = z
  .object({
    password: z.string().min(8, "Не короче 8 символов").max(128).regex(/[A-Za-zА-Яа-яЁё]/, "Добавьте буквы").regex(/\d/, "Добавьте цифру"),
    repeat: z.string(),
  })
  .refine((d) => d.password === d.repeat, { message: "Пароли не совпадают", path: ["repeat"] });

/** Свой пароль вместо временного: сохраняем, закрываем все прочие сессии, пускаем в кабинет. */
export async function changePasswordAction(_: LoginState, form: FormData): Promise<LoginState> {
  const user = await userForPasswordChange();
  const p = newPassword.safeParse({ password: form.get("password"), repeat: form.get("repeat") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (await verifyPassword(user.passwordHash, p.data.password)) return { error: "Новый пароль должен отличаться от временного" };
  const hash = await hashPassword(p.data.password);
  const sid = (await cookies()).get("sid")?.value;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash, mustChangePassword: false } });
    await tx.session.deleteMany({ where: { userId: user.id, ...(sid ? { id: { not: sid } } : {}) } });
    if (user.student) await tx.accountEvent.create({ data: { studentId: user.student.id, actorUserId: user.id, action: "PASSWORD_CHANGED" } });
  });
  redirect(homeFor(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
