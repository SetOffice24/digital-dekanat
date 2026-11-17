import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { contentDisposition } from "@/server/files";
import { readPhoto } from "@/server/photos";
import { photoForViewer } from "@/server/repos/photos";

export const runtime = "nodejs";

/**
 * Фото студента: сам студент и деканат его факультета. Остальным — 404 (не раскрываем, что фото есть).
 * ?download=1 — скачать файлом «Фамилия_Имя_Группа.jpg» (для пропуска и других документов).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await ctx.params).id;
  if (id.length > 40) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  const p = await photoForViewer(user, id);
  if (!p) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  let body: Buffer;
  try {
    body = await readPhoto(p.storageKey);
  } catch {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ...(download ? { "Content-Disposition": contentDisposition(`${p.student.lastName}_${p.student.firstName}_${p.student.group.name}.jpg`) } : {}),
    },
  });
}
