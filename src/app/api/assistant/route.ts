import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/server/auth";
import { buildStudentContext } from "@/server/ai/context";
import { reply } from "@/server/ai/assistant";
import { buildTeacherContext, teacherReply } from "@/server/ai/teacher";
import { buildStaffContext, staffReply } from "@/server/ai/staff";
import { addMessage, createChat, getChat, recentMessages } from "@/server/repos/assistant";
import { describeDraft } from "@/server/ai/drafts";
import type { AiLink } from "@/server/ai/common";

/* лимит: 20 сообщений за 10 минут на пользователя */
const hits = new Map<string, number[]>();
function limited(id: string) {
  const now = Date.now();
  const arr = (hits.get(id) ?? []).filter((t) => now - t < 600000);
  arr.push(now);
  hits.set(id, arr);
  return arr.length > 20;
}

const body = z.object({ message: z.string().trim().min(1).max(1000), chatId: z.string().max(40).optional() });

/**
 * Сообщение помощнику (студент, преподаватель, деканат). Без chatId — создаётся новый чат.
 * Контекст и сценарии — по роли из сессии; помощник видит только данные этого пользователя.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (limited(user.id)) return NextResponse.json({ error: "Слишком много сообщений. Подождите несколько минут." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  const owner = { userId: user.id, studentId: user.student?.id ?? null };

  let chatId = parsed.data.chatId;
  if (chatId) {
    if (!(await getChat(owner, chatId))) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  } else {
    chatId = (await createChat(owner, parsed.data.message)).id;
  }

  await addMessage(owner, chatId, "USER", parsed.data.message);
  const recent = await recentMessages(owner, chatId, 10);
  const history = recent.reverse().map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));

  let r: { text: string; draft?: unknown; links?: AiLink[]; source: string };
  if (user.role === "STUDENT" && user.student) r = await reply(history, await buildStudentContext(user.student));
  else if (user.role === "TEACHER" && user.teacher) r = await teacherReply(history, await buildTeacherContext(user.teacher));
  else if (user.role === "STAFF" && user.staff) r = await staffReply(history, await buildStaffContext(user.staff));
  else return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const saved = await addMessage(owner, chatId, "ASSISTANT", r.text, (r.draft ?? undefined) as Prisma.InputJsonValue | undefined, r.links?.length ? r.links : undefined);
  return NextResponse.json({ chatId, id: saved.id, text: r.text, draft: await describeDraft(r.draft ?? null, user), links: r.links ?? [], source: r.source });
}
