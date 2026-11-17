import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiStudent, isRateLimited, registerFailedAttempt } from "@/server/auth";
import { PhotoError, PHOTO_MAX_MB } from "@/server/photos";
import { uploadPhoto } from "@/server/repos/photos";

export const runtime = "nodejs";

/** Студент загружает фото для документов. Уходит на проверку в деканат. */
export async function POST(req: Request) {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // не больше 20 загрузок в 15 минут — каждая перекодируется на сервере
  const key = `photo|${auth.student.id}`;
  if (isRateLimited(key, 20)) return NextResponse.json({ error: "Слишком много загрузок подряд — попробуйте через 15 минут" }, { status: 429 });
  registerFailedAttempt(key);
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите фото" }, { status: 400 });
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Фото больше ${PHOTO_MAX_MB} МБ — уменьшите его` }, { status: 400 });
  try {
    await uploadPhoto(auth.student, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof PhotoError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  revalidatePath("/profile");
  return NextResponse.json({ ok: true });
}
