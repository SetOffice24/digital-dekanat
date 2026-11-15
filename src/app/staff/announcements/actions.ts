"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { createAnnouncement } from "@/server/repos/staff";
import { plural } from "@/lib/utils";

export type AnnState = { error?: string; ok?: string; n?: number };

const schema = z
  .object({
    title: z.string().trim().min(3, "Заголовок — не короче 3 символов").max(120, "Заголовок — не длиннее 120 символов"),
    body: z.string().trim().min(5, "Текст — не короче 5 символов").max(3000, "Текст — не длиннее 3000 символов"),
    audience: z.enum(["ALL", "FACULTY", "GROUP"], { error: "Выберите аудиторию" }),
    facultyId: z.string().optional(),
    groupId: z.string().optional(),
    pinned: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "FACULTY" && !v.facultyId) ctx.addIssue({ code: "custom", message: "Выберите факультет", path: ["facultyId"] });
    if (v.audience === "GROUP" && !v.groupId) ctx.addIssue({ code: "custom", message: "Выберите группу", path: ["groupId"] });
  });

export async function createAnnouncementAction(_: AnnState, form: FormData): Promise<AnnState> {
  const { staff } = await requireStaff();
  const parsed = schema.safeParse({
    title: form.get("title"),
    body: form.get("body"),
    audience: form.get("audience"),
    facultyId: String(form.get("facultyId") ?? "") || undefined,
    groupId: String(form.get("groupId") ?? "") || undefined,
    pinned: form.get("pinned") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const n = await createAnnouncement(staff, parsed.data);
  if (n === null) return { error: "Эта аудитория вам недоступна" };
  revalidatePath("/staff/announcements");
  return { ok: `Опубликовано. Уведомление получили: ${n} ${plural(n, "студент", "студента", "студентов")}`, n };
}
