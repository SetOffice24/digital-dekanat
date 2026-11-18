"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Send, Upload } from "lucide-react";
import { FileInput } from "@/components/file-input";
import { markSubmissionSentAction } from "@/app/(student)/assistant-actions";
import type { SubmissionCard } from "@/server/ai/drafts";

/**
 * Сдать домашнее задание из чата: выбрать задание, прикрепить файлы, «Отправить преподавателю».
 * Отправка — тем же путём, что со страницы задания (форматы, размер, версия сдачи проверяет сервер).
 */
export function SubmissionDraftCard({ messageId, card, onNavigate }: { messageId: string; card: SubmissionCard; onNavigate?: () => void }) {
  const [id, setId] = useState(card.assignmentId);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(card.done ?? null);
  const [pending, start] = useTransition();
  const chosen = card.options.find((o) => o.id === id);

  if (done)
    return (
      <Link href={done.href} onClick={onNavigate} className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-success transition hover:opacity-90">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Check size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold opacity-80">Отправлено преподавателю — на проверке</span>
          <span className="block truncate font-bold">{done.title}</span>
        </span>
        <span className="shrink-0 text-sm font-bold">Статус →</span>
      </Link>
    );

  if (!card.options.length) return <p className="mt-3 max-w-md rounded-2xl bg-surface-2 p-3 text-sm text-muted">Несданных заданий нет.</p>;

  const send = () => {
    if (!id) return setError("Выберите задание");
    if (!files.length) return setError("Прикрепите хотя бы один файл");
    start(async () => {
      setError(null);
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.set("comment", comment);
      const r = await fetch(`/api/homework/${id}`, { method: "POST", body: fd }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r || !r.ok) return setError(j.error ?? "Не удалось отправить — проверьте связь и попробуйте ещё раз");
      await markSubmissionSentAction(messageId, id);
      setDone({ href: `/homework/${id}`, title: chosen?.title ?? "Задание" });
    });
  };

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Upload size={15} /> Сдать домашнее задание
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Задание</span>
          <select value={id} onChange={(e) => setId(e.target.value)} className="min-h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30">
            {card.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {o.course}
              </option>
            ))}
          </select>
          {chosen && (
            <span className="mt-1 block text-xs text-muted">
              Срок — {chosen.due} · {chosen.state}
            </span>
          )}
        </label>
        <FileInput files={files} onChange={(f) => { setFiles(f); setError(null); }} accept={card.accept} max={card.maxFiles} maxMb={card.maxMb} label="Прикрепить файлы с решением" />
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} placeholder="Комментарий преподавателю (по желанию)" className="w-full rounded-xl bg-surface-2 px-3 py-2 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30" />
      </div>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <button type="button" onClick={send} disabled={pending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} Отправить преподавателю
      </button>
      <p className="mt-2 text-[11px] text-muted">Word, PDF, Excel или PowerPoint. Новая отправка заменит прежние файлы.</p>
    </div>
  );
}
