"use client";
import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { FormMessage } from "@/components/staff/bits";
import { cn } from "@/lib/utils";
import { rateRequestAction, type ActState } from "../../services/actions";

/** Оценка услуги 1–5 (и по желанию — что улучшить). Видит руководство деканата в аналитике. */
export function RateForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActState, FormData>(rateRequestAction.bind(null, id), {});
  const [rating, setRating] = useState(0);
  if (state.ok) return <FormMessage ok={state.ok} />;
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">Оцените, как деканат справился с заявкой — это помогает улучшать работу.</p>
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1" role="radiogroup" aria-label="Оценка">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} из 5`} onClick={() => setRating(n)} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <Star size={26} className={cn(n <= rating ? "fill-[#f5b301] text-[#f5b301]" : "text-muted")} />
          </button>
        ))}
      </div>
      {rating > 0 && rating <= 3 && <textarea name="comment" maxLength={500} placeholder="Что пошло не так? Руководство увидит комментарий" className="block min-h-20 w-full rounded-2xl border border-border bg-surface p-3 text-sm" />}
      {rating > 3 && <input name="comment" maxLength={500} placeholder="Комментарий (по желанию)" className="block min-h-11 w-full rounded-2xl border border-border bg-surface px-3 text-sm" />}
      <FormMessage error={state.error} />
      <button type="submit" disabled={!rating || pending} className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-40">
        {pending ? "Отправляем…" : "Отправить оценку"}
      </button>
    </form>
  );
}
