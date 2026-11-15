"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/server/auth";
import { markRead, saveCheckin } from "@/server/repos/student";
import { mondayOf, moscowToday } from "@/lib/utils";

export async function saveCheckinAction(mood: number) {
  const { student } = await requireStudent();
  const m = z.number().int().min(1).max(5).parse(mood);
  await saveCheckin(student, mondayOf(moscowToday()), m);
}

export async function markReadAction(id?: string) {
  const { user } = await requireStudent();
  await markRead(user.id, id ? z.string().max(40).parse(id) : undefined);
  revalidatePath("/notifications");
}
