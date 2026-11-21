"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, UserX } from "lucide-react";
import { markAppointmentAction, reviewDocumentAction } from "@/app/service-actions";
import { cn } from "@/lib/utils";

export type DeskItem = { id: string; time: string; day: string; student: string; group: string; purpose: string; status: string; request: { href: string; label: string } | null; past: boolean };

const STATUS: Record<string, string> = { BOOKED: "ждём", DONE: "пришёл", NO_SHOW: "не пришёл" };

/** Приём в деканате: кто записан, зачем, с какой заявкой; отметка «пришёл / не пришёл». */
export function DeskList({ items }: { items: DeskItem[] }) {
  const [pending, start] = useTransition();
  if (!items.length) return <p className="rounded-[24px] border border-dashed border-border p-6 text-center text-sm text-muted">Записей нет.</p>;
  return (
    <ul className="divide-y divide-border/60 rounded-[24px] border border-border/70 bg-surface">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="w-24 shrink-0">
            <span className="block font-semibold tabular-nums">{a.time}</span>
            <span className="block text-[12px] text-muted">{a.day}</span>
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold">
              {a.student} <span className="font-normal text-muted">· {a.group}</span>
            </span>
            <span className="block text-muted">
              {a.purpose}
              {a.request && (
                <>
                  {" · "}
                  <Link href={a.request.href} className="font-medium text-fg underline-offset-4 hover:underline">
                    {a.request.label}
                  </Link>
                </>
              )}
            </span>
          </span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", a.status === "DONE" ? "bg-success-soft text-success" : a.status === "NO_SHOW" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>{STATUS[a.status]}</span>
          {a.past && (
            <span className="flex gap-1">
              <button type="button" disabled={pending} onClick={() => start(() => markAppointmentAction(a.id, "DONE"))} aria-label="Пришёл" title="Пришёл" className="flex size-10 items-center justify-center rounded-full border border-border hover:border-success hover:text-success disabled:opacity-50">
                <Check size={16} />
              </button>
              <button type="button" disabled={pending} onClick={() => start(() => markAppointmentAction(a.id, "NO_SHOW"))} aria-label="Не пришёл" title="Не пришёл" className="flex size-10 items-center justify-center rounded-full border border-border hover:border-danger hover:text-danger disabled:opacity-50">
                <UserX size={16} />
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export type ReviewDoc = { id: string; title: string; status: string; validUntil: string | null; note: string | null; replaced?: string | null };

/** Документы заявки: открыть, принять или вернуть студенту с причиной. */
export function DocReview({ docs, path }: { docs: ReviewDoc[]; path: string }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const act = (id: string, status: "VERIFIED" | "REJECTED") =>
    start(async () => {
      const r = await reviewDocumentAction(id, status, note, path);
      setMsg((m) => ({ ...m, [id]: r.error ?? r.ok ?? "" }));
      if (!r.error) setRejecting(null);
    });
  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li key={d.id} className={cn("rounded-2xl border border-border/70 p-3 text-sm", d.replaced && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 font-semibold underline-offset-4 hover:underline">
              {d.title}
            </a>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", d.replaced ? "bg-surface-2 text-muted" : d.status === "VERIFIED" ? "bg-success-soft text-success" : d.status === "REJECTED" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
              {d.replaced ? `заменён ${d.replaced}` : d.status === "VERIFIED" ? "проверен" : d.status === "REJECTED" ? "не принят" : "не проверен"}
            </span>
          </div>
          {d.validUntil && <p className="mt-0.5 text-[13px] text-muted">действует до {d.validUntil}</p>}
          {d.note && <p className="mt-0.5 text-[13px] text-danger">{d.note}</p>}
          {!d.replaced && d.status !== "VERIFIED" && rejecting !== d.id && (
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={pending} onClick={() => act(d.id, "VERIFIED")} className="min-h-9 rounded-full bg-ink px-3 text-[13px] font-semibold text-ink-fg disabled:opacity-50">
                Принять
              </button>
              <button type="button" onClick={() => (setRejecting(d.id), setNote(""))} className="min-h-9 rounded-full border border-border px-3 text-[13px] font-semibold hover:border-danger hover:text-danger">
                Не принять
              </button>
            </div>
          )}
          {rejecting === d.id && (
            <div className="mt-2 space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} autoFocus maxLength={300} placeholder="Что не так: нечитаемо, истёк срок…" className="block min-h-10 w-full rounded-xl border border-border px-3 text-sm" />
              <div className="flex gap-2">
                <button type="button" disabled={pending || note.trim().length < 3} onClick={() => act(d.id, "REJECTED")} className="min-h-9 rounded-full bg-danger px-3 text-[13px] font-semibold text-white disabled:opacity-50">
                  Вернуть студенту
                </button>
                <button type="button" onClick={() => setRejecting(null)} className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-muted">
                  Отмена
                </button>
              </div>
            </div>
          )}
          {msg[d.id] && <p className="mt-1 text-[13px] font-medium text-muted">{msg[d.id]}</p>}
        </li>
      ))}
    </ul>
  );
}
