import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStudent } from "@/server/auth";
import { buildStudentContext } from "@/server/ai/context";
import { reply } from "@/server/ai/assistant";
import { addMessage, createChat, getChat, recentMessages } from "@/server/repos/assistant";
import { describeDraft } from "@/server/ai/drafts";

/* лимит: 20 сообщений за 10 минут на студента */
const hits = new Map<string, number[]>();
function limited(id: string) {
  const now = Date.now();
  const arr = (hits.get(id) ?? []).filter((t) => now - t < 600000);
  arr.push(now);
  hits.set(id, arr);
  return arr.length > 20;
}

const body = z.object({ message: z.string().trim().min(1).max(1000), chatId: z.string().max(40).optional() });

/** Отправить сообщение. Без chatId — создаётся новый чат. */
export async function POST(req: Request) {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { student } = auth;
  if (limited(student.id)) return NextResponse.json({ error: "Слишком много сообщений. Подождите несколько минут." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });

  let chatId = parsed.data.chatId;
  if (chatId) {
    if (!(await getChat(student, chatId))) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  } else {
    chatId = (await createChat(student, parsed.data.message)).id;
  }

  await addMessage(student, chatId, "USER", parsed.data.message);
  const recent = await recentMessages(student, chatId, 10);
  const history = recent.reverse().map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
  const ctx = await buildStudentContext(student);
  const r = await reply(history, ctx);
  const saved = await addMessage(student, chatId, "ASSISTANT", r.text, r.draft ?? undefined);
  return NextResponse.json({ chatId, id: saved.id, text: r.text, draft: await describeDraft(r.draft ?? null), source: r.source });
}
