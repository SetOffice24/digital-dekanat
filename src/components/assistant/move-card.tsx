"use client";
import { useState, useTransition } from "react";
import { CalendarClock, Check, LoaderCircle } from "lucide-react";
import { moveFromDraftAction } from "@/app/staff/move-actions";
import type { MoveCard } from "@/server/ai/drafts";

const field = "w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30";

/** Черновик переноса пары: сотрудник проверяет пару, дату, время, аудиторию и причину — и нажимает «Перенести». */
export function MoveDraftCard({ messageId, card }: { messageId: string; card: MoveCard }) {
  const [v, setV] = useState(card.values);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(card.done ?? null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (done)
    return (
      <div className="mt-3 flex max-w-md items-start gap-3 rounded-2xl bg-success-soft p-3 text-sm font-semibold text-success">
        <Check size={20} className="shrink-0" /> {done.text}. Студенты получили уведомление.
      </div>
    );

  if (!card.lessons.length) return <p className="mt-3 max-w-md rounded-2xl bg-surface-2 p-3 text-sm text-muted">У группы нет ближайших пар для переноса.</p>;

  const move = () =>
    start(async () => {
      setError(null);
      const r = await moveFromDraftAction(messageId, v);
      if (r.ok) setDone(r.ok);
      else setError(r.error ?? "Не удалось перенести");
    });

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <CalendarClock size={15} /> Перенос пары · черновик
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Какую пару</span>
          <select value={v.lessonId} onChange={set("lessonId")} className={`${field} min-h-11`}>
            <option value="">— выберите пару —</option>
            {card.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[13px] text-muted">Новая дата</span>
            <input type="date" value={v.date} onChange={set("date")} className={`${field} min-h-11`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] text-muted">Аудитория</span>
            <input value={v.room} onChange={set("room")} maxLength={20} placeholder="например, 401" className={`${field} min-h-11`} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Время</span>
          <select value={v.bell} onChange={set("bell")} className={`${field} min-h-11`}>
            <option value="">— выберите пару —</option>
            {card.bells.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Причина (увидят студенты)</span>
          <input value={v.reason} onChange={set("reason")} maxLength={300} placeholder="например, преподаватель на конференции" className={`${field} min-h-11`} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <button type="button" onClick={move} disabled={pending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
        {pending && <LoaderCircle size={16} className="animate-spin" />} Перенести
      </button>
      <p className="mt-2 text-[11px] text-muted">Помощник только подготовил перенос — переносите вы.</p>
    </div>
  );
}
