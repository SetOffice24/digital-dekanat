"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, LoaderCircle, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendFromDraftAction } from "@/app/teacher/message-actions";
import type { MessageCard } from "@/server/ai/drafts";

const field = "w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30";

/** Черновик сообщения преподавателя: одному студенту или напоминание группе. Отправляет преподаватель. */
export function MessageDraftCard({ messageId, card, onNavigate }: { messageId: string; card: MessageCard; onNavigate?: () => void }) {
  const [v, setV] = useState(card.values);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(card.done ?? null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (done)
    return done.href ? (
      <Link href={done.href} onClick={onNavigate} className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-success transition hover:opacity-90">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Check size={20} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold">Сообщение отправлено студенту</span>
        <span className="shrink-0 text-sm font-bold">Переписка →</span>
      </Link>
    ) : (
      <div className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-sm font-semibold text-success">
        <Check size={20} /> Напоминание отправлено · получили {done.sentTo} студ.
      </div>
    );

  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendFromDraftAction(messageId, v);
      if (r.ok) setDone(r.ok);
      else setError(r.error ?? "Не удалось отправить");
    });

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <MessageSquareText size={15} /> Сообщение · черновик
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {(["STUDENT", "GROUP"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={v.mode === m} onClick={() => setV((s) => ({ ...s, mode: m }))} className={cn("min-h-9 rounded-full border px-3 font-medium", v.mode === m ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
              {m === "STUDENT" ? "Студенту" : "Напомнить группе"}
            </button>
          ))}
        </div>
        {v.mode === "STUDENT" ? (
          <select value={v.studentUserId} onChange={set("studentUserId")} aria-label="Студент" className={`${field} min-h-11`}>
            <option value="">— выберите студента —</option>
            {card.students.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name} · {s.group}
              </option>
            ))}
          </select>
        ) : (
          <select value={v.groupId} onChange={set("groupId")} aria-label="Группа" className={`${field} min-h-11`}>
            <option value="">— выберите группу —</option>
            {card.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Тема</span>
          <input value={v.subject} onChange={set("subject")} maxLength={150} className={`${field} min-h-11`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Текст</span>
          <textarea value={v.body} onChange={set("body")} maxLength={4000} rows={3} className={`${field} py-2`} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <button type="button" onClick={send} disabled={pending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
        {pending && <LoaderCircle size={16} className="animate-spin" />} Отправить
      </button>
      <p className="mt-2 text-[11px] text-muted">{v.mode === "STUDENT" ? "Придёт в личные сообщения студента." : "Студенты группы получат уведомление (групповых чатов нет)."}</p>
    </div>
  );
}
