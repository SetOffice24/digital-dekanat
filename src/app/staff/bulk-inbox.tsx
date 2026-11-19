"use client";
import { useRef, useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { bulkStatusAction } from "./inbox-actions";

/**
 * Список входящих с выбором нескольких заявок: снизу появляется панель «Выбрано N — Взять в работу».
 * Строки рисует сервер; здесь только отмеченные галочки (input name="ids") и одно действие на всех.
 */
export function BulkInbox({ to, label, children }: { to: "IN_REVIEW" | "DONE"; label: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const checked = () => [...(box.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked') ?? [])];
  const recount = () => setCount(checked().length);
  const all = (on: boolean) => {
    box.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((i) => (i.checked = on));
    recount();
  };
  const run = () =>
    start(async () => {
      const ids = checked().map((i) => i.value);
      const r = await bulkStatusAction(ids, to);
      setResult(`Готово: ${r.done}${r.skipped ? `, пропущено ${r.skipped} (уже изменились)` : ""}`);
      setCount(0);
    });
  return (
    <div ref={box} onChange={recount}>
      <div className="mb-2 flex items-center gap-3 px-1 text-sm">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" onChange={(e) => all(e.target.checked)} className="size-5 accent-[var(--ink)]" aria-label="Выбрать все" /> Выбрать все
        </label>
        {result && (
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <Check size={15} /> {result}
          </span>
        )}
      </div>
      {children}
      {count > 0 && (
        <div className="sticky bottom-4 z-10 mt-3 flex items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-ink-fg shadow-[0_18px_40px_-16px_rgba(14,14,16,0.5)]">
          <span className="text-sm font-semibold">Выбрано: {count}</span>
          <button type="button" disabled={pending} onClick={run} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#0e0e10] disabled:opacity-60">
            {pending && <LoaderCircle size={15} className="animate-spin" />} {label}
          </button>
        </div>
      )}
    </div>
  );
}
