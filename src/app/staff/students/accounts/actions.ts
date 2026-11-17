"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { AccountError, blockStudent, createStudent, resetPassword, transferStudent, unblockStudent } from "@/server/repos/accounts";

type Result = { ok?: string; error?: string; password?: string; login?: string; studentId?: string };
const id = z.string().min(1).max(40);

/** Общая обёртка: проверка сотрудника, понятные ошибки, обновление экранов «Студенты». */
async function run(fn: (staff: Awaited<ReturnType<typeof requireStaff>>["staff"]) => Promise<Result>): Promise<Result> {
  const { staff } = await requireStaff();
  try {
    const r = await fn(staff);
    revalidatePath("/staff/students", "layout");
    return r;
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    throw e;
  }
}

export async function blockAction(studentId: string, reason: string) {
  const p = z.object({ id, reason: z.string().trim().min(3, "Укажите причину — её увидит деканат в журнале").max(300) }).safeParse({ id: studentId, reason });
  if (!p.success) return { error: p.error.issues[0].message };
  return run(async (staff) => (await blockStudent(staff, p.data.id, p.data.reason), { ok: "Аккаунт заблокирован, студент вышел со всех устройств" }));
}

export async function unblockAction(studentId: string) {
  const p = id.safeParse(studentId);
  if (!p.success) return { error: "Студент не найден" };
  return run(async (staff) => (await unblockStudent(staff, p.data), { ok: "Блокировка снята" }));
}

export async function resetPasswordAction(studentId: string) {
  const p = id.safeParse(studentId);
  if (!p.success) return { error: "Студент не найден" };
  return run(async (staff) => ({ ok: "Временный пароль выдан", password: await resetPassword(staff, p.data) }));
}

export async function transferAction(studentId: string, groupId: string, subgroup: number) {
  const p = z.object({ id, groupId: id, subgroup: z.number().int().min(1).max(2) }).safeParse({ id: studentId, groupId, subgroup });
  if (!p.success) return { error: "Выберите группу и подгруппу" };
  return run(async (staff) => ({ ok: `Перевод выполнен: ${await transferStudent(staff, p.data.id, p.data.groupId, p.data.subgroup)}` }));
}

const name = (label: string) => z.string().trim().min(1, `Укажите ${label}`).max(60).regex(/^[А-Яа-яЁёA-Za-z' -]+$/, `${label[0].toUpperCase() + label.slice(1)} — только буквы, дефис и пробел`);
const schema = z.object({
  lastName: name("фамилию"),
  firstName: name("имя"),
  middleName: z.string().trim().max(60).regex(/^[А-Яа-яЁёA-Za-z' -]*$/, "Отчество — только буквы").optional(),
  groupId: id,
  subgroup: z.coerce.number().int().min(1).max(2),
  recordBookNo: z.string().trim().min(3, "Укажите № зачётной книжки").max(30).regex(/^[0-9A-Za-zА-Яа-я-]+$/, "№ зачётки — цифры, буквы и дефис"),
  email: z.union([z.literal(""), z.string().trim().email("Почта указана неверно").max(120)]).optional(),
});

export async function createStudentAction(_: Result, form: FormData): Promise<Result> {
  const p = schema.safeParse(Object.fromEntries(["lastName", "firstName", "middleName", "groupId", "subgroup", "recordBookNo", "email"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!p.success) return { error: p.error.issues[0].message };
  return run(async (staff) => {
    const r = await createStudent(staff, p.data);
    return { ok: `Студент добавлен в ${r.group}`, login: r.login, password: r.password, studentId: r.studentId };
  });
}
