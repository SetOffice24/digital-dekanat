"use client";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { bulkGradesAction, type BulkState } from "./actions";

type Row = { enrollmentId: string; name: string; total: number };

const bad = (v: string, max: number) => v !== "" && (!/^\d+$/.test(v) || Number(v) > max);

export function BulkForm({ groupId, courseId, kinds, max, rows }: { groupId: string; courseId: string; kinds: readonly string[]; max: number; rows: Row[] }) {
  const [state, action, pending] = useActionState<BulkState, FormData>(bulkGradesAction, {});
  const [note, setNote] = useState<string>(state.note ?? kinds[0]);
  const [values, setValues] = useState<Record<string, string>>(state.values ?? {});
  const filled = Object.values(values).filter((v) => v !== "" && !bad(v, max)).length;
  const hasBad = Object.values(values).some((v) => bad(v, max));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="note" value={note} />

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-muted">За какую работу</legend>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => setNote(k)} aria-pressed={note === k} className={cn("min-h-10 rounded-full border px-4 text-sm font-medium transition", note === k ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink")}>
              {k}
            </button>
          ))}
        </div>
      </fieldset>

      <ol className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
        {rows.map((r, i) => {
          const v = values[r.enrollmentId] ?? "";
          return (
            <li key={r.enrollmentId} className={cn("flex items-center gap-3 px-4 py-2.5 sm:px-5", i > 0 && "border-t border-border/60")}>
              <span className="w-6 shrink-0 text-sm text-muted tabular-nums">{i + 1}</span>
              <label htmlFor={`p_${r.enrollmentId}`} className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{r.name}</span>
                <span className="block text-xs text-muted">сейчас {r.total} баллов</span>
              </label>
              <input
                id={`p_${r.enrollmentId}`}
                name={`p_${r.enrollmentId}`}
                inputMode="numeric"
                autoComplete="off"
                value={v}
                onChange={(e) => setValues((s) => ({ ...s, [r.enrollmentId]: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                onKeyDown={(e) => {
                  // Enter — к следующему студенту, как в таблице
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = rows[i + 1];
                    if (next) document.getElementById(`p_${next.enrollmentId}`)?.focus();
                  }
                }}
                placeholder="—"
                aria-invalid={bad(v, max)}
                aria-label={`Баллы: ${r.name}`}
                className={cn("h-11 w-16 shrink-0 rounded-xl bg-surface-2 text-center text-lg font-semibold tabular-nums outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30", bad(v, max) && "ring-2 ring-danger/60")}
              />
              <span className="w-8 shrink-0 text-sm text-muted">/{max}</span>
            </li>
          );
        })}
      </ol>

      {state.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      {/* Кнопка всегда под рукой: закреплена внизу экрана */}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-border/70 bg-bg/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <span className="min-w-0 flex-1 text-sm text-muted">
          {hasBad ? <span className="font-medium text-danger">Баллы — от 0 до {max}</span> : <>Заполнено: <b className="text-fg">{filled}</b> из {rows.length}</>}
        </span>
        <button type="submit" disabled={pending || filled === 0 || hasBad} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-40">
          {pending && <LoaderCircle size={17} className="animate-spin" />}
          Сохранить и уведомить
        </button>
      </div>
    </form>
  );
}
