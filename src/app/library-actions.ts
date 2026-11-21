"use server";
/**
 * Библиотека знаний: действия деканата и преподавателя (одни и те же — права проверяет репозиторий по роли).
 * Загрузка PDF/Word: файл проверяется как остальные вложения, текст извлекается и сразу открывается
 * автору на проверку — по этому тексту помощник и будет отвечать.
 */
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { createDoc, deleteDoc, KnowledgeError, MAX_BODY, searchKnowledge, updateDoc, type DocInput } from "@/server/repos/knowledge";
import { checkContent, checkFile, removeStored, storeFiles, UploadError } from "@/server/files";
import { ExtractError, extractText } from "@/server/knowledge/text";

export type LibState = { error?: string; ok?: string };

async function author() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "STAFF" && user.role !== "TEACHER")) return null;
  return { user, base: user.role === "STAFF" ? "/staff/library" : "/teacher/library" };
}

const schema = z.object({
  title: z.string().trim().min(3, "Название — от 3 символов").max(160, "Название — до 160 символов"),
  scope: z.enum(["UNIVERSITY", "FACULTY", "COURSE"], { error: "Выберите, для кого материал" }),
  facultyId: z.string().max(40).optional(),
  courseId: z.string().max(40).optional(),
  groupId: z.string().max(40).optional(),
});

const fields = (form: FormData) =>
  schema.safeParse({
    title: form.get("title"),
    scope: form.get("scope"),
    facultyId: String(form.get("facultyId") ?? "") || undefined,
    courseId: String(form.get("courseId") ?? "") || undefined,
    groupId: String(form.get("groupId") ?? "") || undefined,
  });

export async function createDocAction(_: LibState, form: FormData): Promise<LibState> {
  const a = await author();
  if (!a) return { error: "Нет прав" };
  const parsed = fields(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const file = form.get("file");
  let id: string;
  try {
    if (file instanceof File && file.size > 0) {
      if (!/\.(pdf|docx)$/i.test(file.name)) return { error: "Подходят файлы PDF и Word (.docx)" };
      checkFile(file);
      const buf = Buffer.from(await file.arrayBuffer());
      checkContent(file.name, buf);
      const body = await extractText(file.name, buf);
      const [stored] = await storeFiles([file], a.user.id);
      try {
        id = (await createDoc(a.user, { ...parsed.data, body } as DocInput, stored)).id;
      } catch (e) {
        await removeStored([stored.storageKey]);
        throw e;
      }
    } else {
      const body = String(form.get("body") ?? "");
      if (body.length > MAX_BODY) return { error: "Текст слишком длинный — разделите на несколько материалов" };
      id = (await createDoc(a.user, { ...parsed.data, body } as DocInput)).id;
    }
  } catch (e) {
    if (e instanceof KnowledgeError || e instanceof UploadError || e instanceof ExtractError) return { error: e.message };
    console.error("library create", e);
    return { error: "Не удалось прочитать файл. Проверьте, что он открывается, или вставьте текст вручную." };
  }
  revalidatePath(a.base);
  redirect(`${a.base}/${id}?new=1`);
}

export async function updateDocAction(_: LibState, form: FormData): Promise<LibState> {
  const a = await author();
  if (!a) return { error: "Нет прав" };
  const id = String(form.get("id") ?? "");
  const parsed = fields(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const body = String(form.get("body") ?? "");
  if (body.length > MAX_BODY) return { error: "Текст слишком длинный" };
  try {
    const ok = await updateDoc(a.user, id, { ...parsed.data, body } as DocInput);
    if (!ok) return { error: "Материал не найден или недоступен" };
  } catch (e) {
    if (e instanceof KnowledgeError) return { error: e.message };
    throw e;
  }
  revalidatePath(a.base);
  revalidatePath(`${a.base}/${id}`);
  return { ok: "Сохранено — помощник уже отвечает по новому тексту" };
}

export async function deleteDocAction(id: string) {
  const a = await author();
  if (!a) return;
  await deleteDoc(a.user, id);
  revalidatePath(a.base);
  redirect(a.base);
}

/** «Как ответит помощник»: какие фрагменты найдутся по вопросу (в тех материалах, что видит автор). */
export async function previewSearchAction(q: string) {
  const a = await author();
  if (!a || q.trim().length < 3) return [];
  const hits = await searchKnowledge(a.user, q.slice(0, 300), 3);
  return hits.map((h) => ({ docId: h.docId, title: h.title, heading: h.heading, excerpt: h.excerpt, strong: h.coverage >= 0.6 }));
}
