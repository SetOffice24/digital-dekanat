import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStudent } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildStudentContext } from "@/server/ai/context";
import { reply } from "@/server/ai/assistant";

/* лимит: 20 сообщений за 10 минут на студента */
const hits = new Map<string, number[]>();
function limited(id: string) {
  const now = Date.now();
  const arr = (hits.get(id) ?? []).filter((t) => now - t < 600000);
  arr.push(now);
  hits.set(id, arr);
  return arr.length > 20;
}

const body = z.object({ message: z.string().trim().min(1).max(1000) });

export async function POST(req: Request) {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { student } = auth;
  if (limited(student.id)) return NextResponse.json({ error: "Слишком много сообщений. Подождите несколько минут." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });

  await prisma.aiMessage.create({ data: { studentId: student.id, role: "USER", content: parsed.data.message } });
  const recent = await prisma.aiMessage.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const history = recent.reverse().map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
  const ctx = await buildStudentContext(student);
  const r = await reply(history, ctx);
  const saved = await prisma.aiMessage.create({ data: { studentId: student.id, role: "ASSISTANT", content: r.text, draft: r.draft ?? undefined } });
  return NextResponse.json({ id: saved.id, text: r.text, draft: r.draft ?? null, source: r.source });
}

export async function DELETE() {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.aiMessage.deleteMany({ where: { studentId: auth.student.id } });
  return NextResponse.json({ ok: true });
}
