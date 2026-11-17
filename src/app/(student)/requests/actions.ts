"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/server/auth";
import { answerRequest, createRequest } from "@/server/repos/student";
import { prisma } from "@/server/db";
import { parseFields, payloadSchema } from "@/lib/request-fields";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string>; n?: number };

export async function createRequestAction(_: FormState, form: FormData): Promise<FormState> {
  const { student } = await requireStudent();
  const typeId = z.string().max(40).safeParse(form.get("typeId"));
  if (!typeId.success) return { error: "Выберите тип заявки" };
  const type = await prisma.requestType.findUnique({ where: { id: typeId.data } });
  if (!type) return { error: "Тип заявки не найден" };

  const fields = parseFields(type.fields);
  const raw = Object.fromEntries(fields.map((f) => [f.name, String(form.get(`f_${f.name}`) ?? "").slice(0, 2000)]));
  const values = { ...raw, comment: String(form.get("comment") ?? "").slice(0, 1000), wantsPaper: form.get("wantsPaper") === "on" ? "on" : "" };
  const n = Date.now();
  const parsed = payloadSchema(fields).safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Проверьте поля формы", fieldErrors, values, n };
  }
  const p = parsed.data as Record<string, string>;
  if (p.dateFrom && p.dateTo && p.dateFrom > p.dateTo) return { error: "Дата «по» раньше даты «с»", fieldErrors: { dateTo: "Дата «по» раньше даты «с»" }, values, n };

  const wantsPaper = form.get("wantsPaper") === "on";
  const comment = z.string().trim().max(1000).parse(String(form.get("comment") ?? "")) || undefined;
  const r = await createRequest(student, type.id, p, wantsPaper, comment);
  revalidatePath("/requests");
  redirect(`/requests/${r.id}?created=1`);
}

export async function answerRequestAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { student } = await requireStudent();
  const msg = z.string().trim().min(2, "Напишите ответ").max(1000).safeParse(form.get("message"));
  if (!msg.success) return { error: msg.error.issues[0].message };
  const rid = z.string().min(1).max(40).safeParse(id);
  if (!rid.success) return { error: "Заявка не найдена" };
  const ok = await answerRequest(student, rid.data, msg.data);
  if (!ok) return { error: "Ответ уже не требуется" };
  revalidatePath(`/requests/${id}`);
  return {};
}
