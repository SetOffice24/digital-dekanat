"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { BookOpenCheck, Check, LoaderCircle } from "lucide-react";
import { assignFromDraftAction } from "@/app/teacher/assistant-actions";
import type { AssignmentCard } from "@/server/ai/drafts";

const field = "w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30";

/** Черновик домашнего задания: преподаватель проверяет группу, название, описание и срок — и нажимает «Выдать». */
export function AssignmentDraftCard({ messageId, card, onNavigate }: { messageId: string; card: AssignmentCard; onNavigate?: () => void }) {
  const [v, setV] = useState(card.values);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(card.done ?? null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (done)
    return (
      <Link href={done.href} onClick={onNavigate} className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-success transition hover:opacity-90">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Check size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold opacity-80">Задание выдано, студенты получили уведомление</span>
          <span className="block truncate font-bold">{done.title}</span>
        </span>
        <span className="shrink-0 text-sm font-bold">Открыть →</span>
      </Link>
    );

  const give = () =>
    start(async () => {
      setError(null);
      const r = await assignFromDraftAction(messageId, v);
      if (r.ok) setDone(r.ok);
      else setError(r.error ?? "Не удалось выдать задание");
    });

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <BookOpenCheck size={15} /> Домашнее задание · черновик
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Группа и дисциплина</span>
          <select value={v.pair} onChange={set("pair")} className={`${field} min-h-11`}>
            <option value="">— выберите —</option>
            {card.pairs.map((p) => (
              <option key={`${p.groupId}|${p.courseId}`} value={`${p.groupId}|${p.courseId}`}>
                {p.groupName} · {p.courseName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Название</span>
          <input value={v.title} onChange={set("title")} maxLength={150} className={`${field} min-h-11`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Что сделать</span>
          <textarea value={v.description} onChange={set("description")} maxLength={4000} rows={3} placeholder="Опишите задание — студенты увидят этот текст" className={`${field} py-2`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Сдать до (время московское)</span>
          <input type="datetime-local" value={v.dueAt} onChange={set("dueAt")} className={`${field} min-h-11`} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={give} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
          {pending && <LoaderCircle size={16} className="animate-spin" />} Выдать
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Помощник только подготовил задание — выдаёте вы. Файлы можно прикрепить на странице задания.</p>
    </div>
  );
}
