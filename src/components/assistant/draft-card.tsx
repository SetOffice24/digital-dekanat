"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, FileCheck2, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { orderFromDraftAction } from "@/app/(student)/assistant-actions";
import type { DraftCard as Card } from "@/server/ai/drafts";

// быстрые варианты для частого поля «куда»
const PLACE_HINTS = ["В банк", "По месту работы", "В соцзащиту"];

/**
 * Карточка действия: помощник распознал справку и заполнил, что понял.
 * Недостающее — заполнить прямо здесь; заявка уходит только по нажатию «Заказать».
 */
export function DraftCard({ messageId, card, onNavigate }: { messageId: string; card: Card; onNavigate?: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(card.values);
  const [paper, setPaper] = useState(card.needsPaper);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; number: number } | null>(card.requestId && card.requestNumber ? { id: card.requestId, number: card.requestNumber } : null);
  const [pending, start] = useTransition();

  if (done)
    return (
      <Link href={`/requests/${done.id}`} onClick={onNavigate} className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-success-soft p-3 text-success transition hover:opacity-90">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Check size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold opacity-80">Заявка отправлена в деканат</span>
          <span className="block truncate font-bold">
            {card.title} № {done.number}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold">Статус →</span>
      </Link>
    );

  // заявления (пересдача, пропуск…) требуют пояснений — отправляются через полную форму
  if (!card.oneClick)
    return (
      <Link href={`/requests/new?draft=${messageId}`} onClick={onNavigate} className="mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-primary-soft p-3 text-primary transition hover:opacity-90">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
          <FileCheck2 size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold opacity-80">Черновик заявления готов</span>
          <span className="block truncate font-bold">{card.title}</span>
        </span>
        <span className="shrink-0 text-sm font-bold">Проверить →</span>
      </Link>
    );

  const order = () =>
    start(async () => {
      setError(null);
      const r = await orderFromDraftAction(messageId, values, paper);
      if (r.ok) setDone(r.ok);
      else {
        setError(r.error ?? "Не удалось отправить");
        setErrors(r.fieldErrors ?? {});
      }
    });

  return (
    <div className="mt-3 max-w-md rounded-2xl border border-border/70 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <FileCheck2 size={15} /> Готово к отправке · будет готово за {card.slaDays} раб. {card.slaDays === 1 ? "день" : "дня"}
      </div>
      <div className="mt-1 font-bold">{card.title}</div>

      <div className="mt-3 space-y-3">
        {card.fields.map((f) => {
          const v = values[f.name] ?? "";
          const set = (x: string) => {
            setValues((s) => ({ ...s, [f.name]: x }));
            setErrors((e) => ({ ...e, [f.name]: "" }));
          };
          return (
            <div key={f.name}>
              <div className="mb-1 text-[13px] text-muted">{f.label}</div>
              {f.type === "select" && f.options?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map((o) => (
                    <button key={o} type="button" onClick={() => set(o)} aria-pressed={v === o} className={cn("min-h-9 rounded-full border px-3 text-sm font-medium transition", v === o ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <input value={v} onChange={(e) => set(e.target.value)} maxLength={200} placeholder={f.placeholder} aria-invalid={!!errors[f.name]} className={cn("min-h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30", errors[f.name] && "ring-2 ring-danger/50")} />
                  {f.name === "place" && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {PLACE_HINTS.map((h) => (
                        <button key={h} type="button" onClick={() => set(h)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition", v === h ? "bg-ink text-ink-fg" : "bg-surface-2 text-muted hover:text-fg")}>
                          {h}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {errors[f.name] && <p className="mt-1 text-xs font-medium text-danger">{errors[f.name]}</p>}
            </div>
          );
        })}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          Нужна бумажная копия с печатью
        </label>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={order} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50">
          {pending && <LoaderCircle size={16} className="animate-spin" />}
          Заказать
        </button>
        <Link href={`/requests/new?draft=${messageId}`} onClick={onNavigate} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:text-fg">
          Открыть полную форму
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-muted">Помощник только подготовил заявку — отправляете вы.</p>
    </div>
  );
}
