"use client";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import { reviewAction } from "./actions";

/** Принять / вернуть на доработку. Для возврата — обязательный комментарий, что исправить. */
export function ReviewControls({ submissionId, version, status }: { submissionId: string; version: number; status: "SUBMITTED" | "RETURNED" | "ACCEPTED" }) {
  const [mode, setMode] = useState<"idle" | "return">("idle");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (s: "ACCEPTED" | "RETURNED") =>
    start(async () => {
      setError(null);
      const r = await reviewAction(submissionId, version, s, comment);
      if (r.error) setError(r.error);
      else {
        setMode("idle");
        setComment("");
      }
    });

  const returnForm = (
    <div className="space-y-2">
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} autoFocus placeholder="Что исправить — студент увидит этот комментарий" className="w-full rounded-xl bg-surface-2 px-3 py-2 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run("RETURNED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-warning px-4 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />} Вернуть студенту
        </button>
        <button type="button" onClick={() => setMode("idle")} className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-muted hover:text-fg">
          Отмена
        </button>
      </div>
    </div>
  );

  return (
    <div className="mt-3">
      {mode === "return" ? (
        returnForm
      ) : status === "SUBMITTED" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run("ACCEPTED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-50">
            {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Принять
          </button>
          <button type="button" onClick={() => setMode("return")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:border-ink">
            <RotateCcw size={15} /> На доработку
          </button>
        </div>
      ) : status === "ACCEPTED" ? (
        <button type="button" onClick={() => window.confirm("Работа уже принята. Вернуть её студенту на доработку?") && setMode("return")} className="text-sm font-medium text-muted underline underline-offset-2 hover:text-fg">
          Вернуть на доработку
        </button>
      ) : null}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
