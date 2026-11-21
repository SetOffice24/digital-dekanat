"use client";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import { reviewAction } from "./actions";

const MAX = 20;

/**
 * Проверка сдачи: «Принять» с баллами (по желанию) или «На доработку» с обязательным комментарием.
 * Баллы попадают в журнал одной записью, связанной с этой работой; возврат снимает их — об этом сказано до нажатия.
 */
export function ReviewControls({ submissionId, version, status, points }: { submissionId: string; version: number; status: "SUBMITTED" | "RETURNED" | "ACCEPTED"; points: number | null }) {
  const [mode, setMode] = useState<"idle" | "return">("idle");
  const [comment, setComment] = useState("");
  const [score, setScore] = useState(points === null ? "" : String(points));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (s: "ACCEPTED" | "RETURNED") =>
    start(async () => {
      setError(null);
      const n = s === "ACCEPTED" && score.trim() !== "" ? Number(score) : null;
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > MAX)) return setError(`Баллы — целое число от 0 до ${MAX}`);
      const r = await reviewAction(submissionId, version, s, s === "RETURNED" ? comment : "", n);
      if (r.error) setError(r.error);
      else {
        setMode("idle");
        setComment("");
      }
    });

  const returnForm = (
    <div className="space-y-2">
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} autoFocus placeholder="Что исправить — студент увидит этот комментарий" className="w-full rounded-xl bg-surface-2 px-3 py-2 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30" />
      {points !== null && <p className="text-[13px] text-warning">Баллы за работу ({points}) будут сняты до повторной проверки.</p>}
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

  const scoreInput = (
    <label className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm">
      <span className="text-muted">Баллы</span>
      <input value={score} onChange={(e) => setScore(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} inputMode="numeric" placeholder="—" aria-label={`Баллы за работу, из ${MAX}`} className="w-8 bg-transparent text-center font-semibold tabular-nums outline-none" />
      <span className="text-muted">из {MAX}</span>
    </label>
  );

  return (
    <div className="mt-3">
      {mode === "return" ? (
        returnForm
      ) : status === "SUBMITTED" ? (
        <div className="flex flex-wrap items-center gap-2">
          {scoreInput}
          <button type="button" disabled={pending} onClick={() => run("ACCEPTED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-50">
            {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} {score.trim() ? "Принять и поставить баллы" : "Принять без баллов"}
          </button>
          <button type="button" onClick={() => setMode("return")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:border-ink">
            <RotateCcw size={15} /> На доработку
          </button>
        </div>
      ) : status === "ACCEPTED" ? (
        <div className="flex flex-wrap items-center gap-2">
          {scoreInput}
          {score !== (points === null ? "" : String(points)) && (
            <button type="button" disabled={pending} onClick={() => run("ACCEPTED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-50">
              {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Сохранить баллы
            </button>
          )}
          <button type="button" onClick={() => window.confirm("Работа уже принята. Вернуть её студенту на доработку?") && setMode("return")} className="text-sm font-medium text-muted underline underline-offset-2 hover:text-fg">
            Вернуть на доработку
          </button>
        </div>
      ) : null}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
