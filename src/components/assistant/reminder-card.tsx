"use client";
import { useState, useTransition } from "react";
import { Bell, Check, LoaderCircle } from "lucide-react";
import { createReminderAction } from "@/app/reminder-actions";
import type { ReminderCard } from "@/server/ai/drafts";

const field = "w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30";

/** Напоминание себе: проверить текст и время (московское) — «Поставить». В срок придёт уведомление и push. */
export function ReminderDraftCard({ messageId, card }: { messageId: string; card: ReminderCard }) {
  const [v, setV] = useState(card.values);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(card.done ?? null);
  const [pending, start] = useTransition();

  if (done)
    return (
      <div className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-[15px] font-semibold text-success">
        <Check size={20} className="shrink-0" /> Напомню {done.when}
      </div>
    );

  const save = () =>
    start(async () => {
      setError(null);
      const r = await createReminderAction(messageId, v);
      if (r.ok) setDone(r.ok);
      else setError(r.error ?? "Не удалось поставить напоминание");
    });

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
        <Bell size={15} /> Напоминание
      </div>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">О чём</span>
          <input value={v.text} onChange={(e) => setV((s) => ({ ...s, text: e.target.value }))} maxLength={200} className={`${field} min-h-11`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Когда (время московское)</span>
          <input type="datetime-local" value={v.dueAt} onChange={(e) => setV((s) => ({ ...s, dueAt: e.target.value }))} className={`${field} min-h-11`} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <button type="button" onClick={save} disabled={pending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
        {pending && <LoaderCircle size={16} className="animate-spin" />} Поставить напоминание
      </button>
      <p className="mt-2 text-[13px] text-muted">Придёт уведомлением и на телефон, если включены push-уведомления.</p>
    </div>
  );
}
