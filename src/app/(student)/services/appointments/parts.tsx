"use client";
import { useActionState, useState, useTransition } from "react";
import { FormMessage } from "@/components/staff/bits";
import { cn } from "@/lib/utils";
import { bookAppointmentAction, cancelAppointmentAction, type ActState } from "../actions";

type Day = { day: string; slots: { at: string; free: boolean }[] };

const dayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export function BookingForm({ days, purpose, requestId }: { days: Day[]; purpose: string; requestId: string }) {
  const [state, action, pending] = useActionState<ActState, FormData>(bookAppointmentAction, {});
  const firstFree = days.findIndex((d) => d.slots.some((s) => s.free));
  const [dayIdx, setDayIdx] = useState(Math.max(0, firstFree));
  const [picked, setSlot] = useState<string | null>(null);
  if (!days.length) return <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">В ближайшие дни приёма нет.</p>;
  const d = days[dayIdx];
  // после записи страница обновится и слот станет занятым — выбор сам сбрасывается
  const slot = picked && d.slots.some((s) => s.at === picked && s.free) ? picked : null;
  return (
    <form action={action} className="rounded-[28px] border border-border/70 bg-surface p-5">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="startsAt" value={slot ?? ""} />
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((x, i) => {
          const free = x.slots.filter((s) => s.free).length;
          return (
            <button key={x.day} type="button" onClick={() => (setDayIdx(i), setSlot(null))} disabled={!free} className={cn("min-w-[88px] shrink-0 rounded-2xl border px-3 py-2 text-center transition disabled:opacity-40", i === dayIdx ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
              <span className="block text-sm font-semibold capitalize">{dayFmt.format(new Date(x.day))}</span>
              <span className={cn("block text-[12px]", i === dayIdx ? "text-ink-fg/70" : "text-muted")}>{free ? `${free} своб.` : "занято"}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
        {d.slots.map((s) => (
          <button key={s.at} type="button" disabled={!s.free} onClick={() => setSlot(s.at)} aria-pressed={slot === s.at} className={cn("min-h-11 rounded-xl border text-sm font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-2 disabled:text-muted/50 disabled:line-through", slot === s.at ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
            {timeFmt.format(new Date(s.at))}
          </button>
        ))}
      </div>
      <label className="block text-sm font-semibold">
        С чем придёте
        <input name="purpose" required minLength={3} maxLength={200} defaultValue={purpose} placeholder="Например: забрать справку для военкомата" className="mt-1 block min-h-12 w-full rounded-2xl border border-border bg-surface px-3 text-[15px]" />
      </label>
      <div className="mt-3">
        <FormMessage error={state.error} ok={state.ok} />
      </div>
      <button type="submit" disabled={pending || !slot} className="mt-3 inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-ink-fg disabled:opacity-40">
        {pending ? "Записываем…" : slot ? `Записаться: ${dayFmt.format(new Date(d.day))}, ${timeFmt.format(new Date(slot))}` : "Выберите время"}
      </button>
    </form>
  );
}

export function CancelButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => confirm("Отменить запись?") && start(() => cancelAppointmentAction(id))} className="shrink-0 rounded-full border border-ink/30 px-4 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-50">
      {pending ? "…" : "Отменить"}
    </button>
  );
}
