import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { deleteMaterial } from "@/server/repos/homework";

/** Удалить свой материал (вместе с файлами). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER" || !user.teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await deleteMaterial(user.teacher, (await ctx.params).id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Не найдено" }, { status: 404 });
}
