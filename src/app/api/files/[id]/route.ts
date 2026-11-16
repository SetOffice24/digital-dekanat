import { getCurrentUser } from "@/server/auth";
import { canAccessAttachment, readStored } from "@/server/files";

export const runtime = "nodejs";

/** Скачать файл материала/задания/сдачи. Нет прав или файла — 404 (неотличимо). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notFound = () => new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return notFound();
  const a = await canAccessAttachment(user, (await ctx.params).id);
  if (!a) return notFound();
  const data = await readStored(a.storageKey).catch(() => null);
  if (!data) return notFound();
  // только скачивание: браузер не исполняет и не угадывает тип
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
