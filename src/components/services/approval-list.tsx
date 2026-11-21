"use client";
import { useState, useTransition } from "react";
import { Check, FileText, X } from "lucide-react";
import { decideApprovalAction } from "@/app/service-actions";
import { cn } from "@/lib/utils";

export type ApprovalItem = {
  id: string;
  number: number;
  title: string;
  student: string;
  group: string;
  created: string;
  due: string | null;
  fields: { label: string; value: string }[];
  comment: string | null;
  docs: { id: string; title: string; status: string }[];
  route: { label: string; status: string; comment: string | null }[];
  owner: string;
};

/** Шаги согласования, ждущие решения: всё, что нужно для решения, — в карточке; отказ — только с причиной. */
export function ApprovalList({ items, empty }: { items: ApprovalItem[]; empty: string }) {
  if (!items.length) return <p className="rounded-[24px] border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <ApprovalCard key={it.id} it={it} />
      ))}
    </div>
  );
}

/** Кнопки решения по одному шагу (в карточке заявки). */
export function ApproveButtons({ approvalId }: { approvalId: string }) {
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <p className="text-sm font-semibold text-success">{msg.ok}</p>;
  return (
    <div className="space-y-2">
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Комментарий (при отказе — обязательно)" className="block min-h-16 w-full rounded-2xl border border-border bg-surface p-3 text-sm" />
      {msg?.error && <p role="alert" className="text-sm font-medium text-danger">{msg.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => setMsg(await decideApprovalAction(approvalId, "APPROVED", comment)))} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-50">
          <Check size={16} /> Согласовать
        </button>
        <button type="button" disabled={pending || comment.trim().length < 3} onClick={() => start(async () => setMsg(await decideApprovalAction(approvalId, "REJECTED", comment)))} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-5 text-sm font-semibold hover:border-danger hover:text-danger disabled:opacity-50">
          <X size={16} /> Отклонить
        </button>
      </div>
    </div>
  );
}

function ApprovalCard({ it }: { it: ApprovalItem }) {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "APPROVED" | "REJECTED") => start(async () => setMsg(await decideApprovalAction(it.id, d, comment)));
  if (msg?.ok) return <p className="rounded-[24px] bg-success-soft p-4 text-sm font-semibold text-success">№{it.number} «{it.title}»: {msg.ok}</p>;
  return (
    <article className="rounded-[24px] border border-border/70 bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {it.title} <span className="font-normal text-muted">№{it.number}</span>
        </h3>
        <span className="text-[13px] text-muted">
          подана {it.created}
          {it.due ? ` · срок ${it.due}` : ""}
        </span>
      </div>
      <p className="mt-0.5 text-sm">
        {it.student} · {it.group}
      </p>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
        {it.fields.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-muted">{f.label}</dt>
            <dd className="font-medium">{f.value || "—"}</dd>
          </div>
        ))}
        {it.comment && (
          <div className="contents">
            <dt className="text-muted">Комментарий</dt>
            <dd>{it.comment}</dd>
          </div>
        )}
      </dl>
      {it.docs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {it.docs.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium hover:border-ink">
              <FileText size={14} /> {d.title}
              <span className={cn(d.status === "VERIFIED" ? "text-success" : "text-muted")}>· {d.status === "VERIFIED" ? "проверен" : d.status === "REJECTED" ? "не принят" : "не проверен"}</span>
            </a>
          ))}
        </div>
      )}
      <p className="mt-3 text-[13px] text-muted">
        Путь: {it.route.map((r) => `${r.label}${r.status === "APPROVED" ? " ✓" : r.status === "PENDING" ? " (сейчас)" : ""}`).join(" → ")} → {it.owner}
      </p>
      {mode === "reject" && (
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} autoFocus placeholder="Причина отказа — студент её увидит" className="mt-3 block min-h-20 w-full rounded-2xl border border-border bg-surface p-3 text-sm" />
      )}
      {msg?.error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {msg.error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "idle" ? (
          <>
            <button type="button" disabled={pending} onClick={() => decide("APPROVED")} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-50">
              <Check size={16} /> Согласовать
            </button>
            <button type="button" disabled={pending} onClick={() => setMode("reject")} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-5 text-sm font-semibold hover:border-danger hover:text-danger disabled:opacity-50">
              <X size={16} /> Отклонить
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending || comment.trim().length < 3} onClick={() => decide("REJECTED")} className="inline-flex min-h-11 items-center rounded-full bg-danger px-5 text-sm font-semibold text-white disabled:opacity-50">
              Отклонить с этой причиной
            </button>
            <button type="button" onClick={() => setMode("idle")} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2">
              Отмена
            </button>
          </>
        )}
      </div>
    </article>
  );
}
