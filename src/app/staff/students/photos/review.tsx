"use client";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { reviewPhotoAction } from "./actions";

// частые причины — одним касанием; можно дописать свою
const REASONS = ["Фон не однотонный", "Лицо мелко или не по центру", "Головной убор или тёмные очки", "Нечёткое или тёмное фото", "Это не фото для документов"];

/** Принять / отклонить фото студента. При отказе — причина обязательна. */
export function PhotoReview({ id }: { id: string }) {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (decision: "APPROVED" | "REJECTED") =>
    start(async () => {
      setError(null);
      const r = await reviewPhotoAction(id, decision, comment);
      if (r.error) setError(r.error);
    });

  return (
    <div className="space-y-2">
      {mode === "reject" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setComment(r)} className={`rounded-full border px-3 py-1 text-xs font-medium ${comment === r ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink"}`}>
                {r}
              </button>
            ))}
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="Причина — студент увидит её" className="min-h-10 w-full rounded-xl bg-surface-2 px-3 text-sm outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run("REJECTED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50">
              {pending ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />} Отклонить
            </button>
            <button type="button" onClick={() => setMode("idle")} className="inline-flex min-h-10 items-center px-3 text-sm font-semibold text-muted hover:text-fg">
              Отмена
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run("APPROVED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-50">
            {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Принять
          </button>
          <button type="button" onClick={() => setMode("reject")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:border-ink">
            <X size={15} /> Не подходит
          </button>
        </div>
      )}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
