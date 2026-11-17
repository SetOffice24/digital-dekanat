import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { setConversationStatus, viewerOf } from "@/server/repos/messages";

/** Деканат: «решено» / «открыть снова». */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = z.object({ status: z.enum(["OPEN", "RESOLVED"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const ok = await setConversationStatus(viewerOf(user), (await ctx.params).id, body.data.status);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Не найдено" }, { status: 404 });
}
