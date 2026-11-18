import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { loadWidget } from "@/server/ai/widgets";

const body = z.object({ type: z.string().regex(/^[a-z]+\.[a-z]+$/), params: z.record(z.string().max(30), z.string().max(60)).default({}) });

/** Данные мини-раздела в чате помощника — актуальные, только в области пользователя (иначе 404). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const data = await loadWidget(user, p.data.type, p.data.params);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
