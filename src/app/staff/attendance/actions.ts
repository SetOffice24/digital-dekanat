"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { loadLessonAttendance, saveLessonAttendance, staffLesson } from "@/server/repos/attendance";
import { guessAbsence, type AbsenceGuess } from "@/server/ai/attendance";
import { moscowToday } from "@/lib/utils";

const ID = z.string().min(1).max(40);

/** Деканат отмечает посещаемость пары (например, по бумажному журналу или за преподавателя). */
export async function saveStaffAttendanceAction(lessonId: string, absentIds: string[]): Promise<{ ok?: string; error?: string }> {
  const { staff } = await requireStaff();
  const parsed = z.object({ lessonId: ID, absentIds: z.array(ID).max(200) }).safeParse({ lessonId, absentIds });
  if (!parsed.success) return { error: "Не удалось сохранить" };
  try {
    const r = await saveLessonAttendance(staffLesson(staff, parsed.data.lessonId), parsed.data.absentIds, moscowToday());
    revalidatePath("/staff/attendance", "layout");
    return { ok: r.absent ? `Сохранено: отсутствуют ${r.absent} из ${r.total}` : `Сохранено: все ${r.total} на месте` };
  } catch (e) {
    return { error: (e as Error).message || "Не удалось сохранить" };
  }
}

/** Распознать фразу «кого нет» — только подсказка, ничего не сохраняет. */
export async function recognizeStaffAbsenceAction(lessonId: string, text: string): Promise<{ guess?: AbsenceGuess; error?: string }> {
  const { staff } = await requireStaff();
  const t = z.string().trim().min(2).max(500).safeParse(text);
  if (!ID.safeParse(lessonId).success || !t.success) return { error: "Напишите, кого нет, например: «нет Зорина и Лесновой»" };
  const data = await loadLessonAttendance(staffLesson(staff, lessonId));
  if (!data) return { error: "Пара не найдена" };
  return { guess: await guessAbsence(t.data, data.students.map((s) => ({ id: s.id, lastName: s.lastName, firstName: s.firstName }))) };
}
