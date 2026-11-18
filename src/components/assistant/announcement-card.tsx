"use client";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { announceFromDraftAction } from "@/app/staff/assistant-actions";
import type { AnnouncementCard } from "@/server/ai/drafts";

const field = "w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30";

/** Черновик объявления: сотрудник проверяет аудиторию, заголовок и текст — и нажимает «Опубликовать». */
export function AnnouncementDraftCard({ messageId, card }: { messageId: string; card: AnnouncementCard }) {
  const [v, setV] = useState(card.values);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(card.done ?? null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (done)
    return (
      <div className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-success">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Check size={20} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold">Объявление опубликовано · уведомление получили {done.sentTo} студ.</span>
      </div>
    );

  const audiences = [
    { key: "GROUP" as const, label: "Группе" },
    card.canAll ? { key: "ALL" as const, label: "Всем студентам" } : { key: "FACULTY" as const, label: `Факультету${card.facultyName ? ` ${card.facultyName}` : ""}` },
  ];

  const publish = () =>
    start(async () => {
      setError(null);
      const r = await announceFromDraftAction(messageId, v);
      if (r.ok) setDone(r.ok);
      else setError(r.error ?? "Не удалось опубликовать");
    });

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Megaphone size={15} /> Объявление · черновик
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <span className="mb-1 block text-[13px] text-muted">Кому</span>
          <div className="flex flex-wrap gap-1.5">
            {audiences.map((a) => (
              <button key={a.key} type="button" aria-pressed={v.audience === a.key} onClick={() => setV((s) => ({ ...s, audience: a.key }))} className={cn("min-h-9 rounded-full border px-3 font-medium", v.audience === a.key ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
                {a.label}
              </button>
            ))}
          </div>
          {v.audience === "GROUP" && (
            <select value={v.groupId} onChange={set("groupId")} aria-label="Группа" className={`${field} mt-2 min-h-11`}>
              <option value="">— выберите группу —</option>
              {card.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Заголовок</span>
          <input value={v.title} onChange={set("title")} maxLength={120} className={`${field} min-h-11`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Текст</span>
          <textarea value={v.body} onChange={set("body")} maxLength={3000} rows={4} className={`${field} py-2`} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <div className="mt-4">
        <button type="button" onClick={publish} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
          {pending && <LoaderCircle size={16} className="animate-spin" />} Опубликовать
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Помощник только подготовил текст — публикуете вы. Студенты получат уведомление.</p>
    </div>
  );
}
