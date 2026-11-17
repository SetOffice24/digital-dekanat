"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/server/auth";
import { markRead, saveCheckin } from "@/server/repos/student";
import { mondayOf, moscowToday } from "@/lib/utils";

export async function saveCheckinAction(mood: number) {
  const { student } = await requireStudent();
  const m = z.number().int().min(1).max(5).safeParse(mood);
  if (!m.success) return;
  await saveCheckin(student, mondayOf(moscowToday()), m.data);
}

export async function markReadAction(id?: string) {
  const { user } = await requireStudent();
  const nid = z.string().min(1).max(40).optional().safeParse(id);
  if (!nid.success) return;
  await markRead(user.id, nid.data);
  revalidatePath("/notifications");
}
