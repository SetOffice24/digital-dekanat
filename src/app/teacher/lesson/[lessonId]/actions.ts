"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/server/auth";
import { getLessonAttendance, saveAttendance } from "@/server/repos/teacher";
import { guessAbsence, type AbsenceGuess } from "@/server/ai/attendance";
import { moscowToday } from "@/lib/utils";

const ID = z.string().min(1).max(40);

/** Сохранить отметки: список отсутствующих (остальные — «был»). */
export async function saveAttendanceAction(lessonId: string, absentIds: string[]): Promise<{ ok?: string; error?: string }> {
  const { teacher } = await requireTeacher();
  const parsed = z.object({ lessonId: ID, absentIds: z.array(ID).max(200) }).safeParse({ lessonId, absentIds });
  if (!parsed.success) return { error: "Не удалось сохранить" };
  try {
    const r = await saveAttendance(teacher, parsed.data.lessonId, parsed.data.absentIds, moscowToday());
    revalidatePath(`/teacher/lesson/${lessonId}`);
    revalidatePath("/teacher");
    return { ok: r.absent ? `Сохранено: отсутствуют ${r.absent} из ${r.total}` : `Сохранено: все ${r.total} на месте` };
  } catch (e) {
    return { error: (e as Error).message || "Не удалось сохранить" };
  }
}

/** Распознать фразу преподавателя («нет Зорина и Лесновой») — только подсказка, ничего не сохраняет. */
export async function recognizeAbsenceAction(lessonId: string, text: string): Promise<{ guess?: AbsenceGuess; error?: string }> {
  const { teacher } = await requireTeacher();
  const t = z.string().trim().min(2).max(500).safeParse(text);
  if (!ID.safeParse(lessonId).success || !t.success) return { error: "Напишите, кого нет, например: «нет Зорина и Лесновой»" };
  const data = await getLessonAttendance(teacher, lessonId);
  if (!data) return { error: "Пара не найдена" };
  const guess = await guessAbsence(t.data, data.students.map((s) => ({ id: s.id, lastName: s.lastName, firstName: s.firstName })));
  return { guess };
}
