"use client";
import { useActionState, useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { revokeCertificateAction, updateServiceAction, type SvcState } from "@/app/service-actions";
import { cn } from "@/lib/utils";

export type ServiceRowData = { id: string; title: string; total: number; onTimePct: number | null; avgDays: number | null; overdueNow: number; rating: number | null; auto: number; slaDays: number; autoIssue: boolean; enabled: boolean; isCertificate: boolean };

/**
 * Строка услуги: просмотр показателей отдельно от настройки. «Настроить» раскрывает панель под строкой —
 * с названием услуги, чтобы при изменении срока было видно, к чему он относится.
 */
function Metric({ value, label, bad, title }: { value: string; label: string; bad?: boolean; title?: string }) {
  return (
    <div className="min-w-0 text-right" title={title}>
      <div className={cn("tabular-nums", value === "—" ? "text-muted" : "font-semibold", bad && "text-danger")}>{value}</div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}

export function ServiceRow({ r, canEdit }: { r: ServiceRowData; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("px-4 py-3 sm:px-5", !r.enabled && "bg-surface-2/40")}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="order-1 min-w-0 flex-1">
          <div className="font-medium leading-snug">{r.title}</div>
          <div className="mt-0.5 text-[13px] text-muted">
            до {r.slaDays} р. дн.
            {r.autoIssue && r.enabled ? " · выдаётся сразу" : ""}
            {!r.enabled && <span className="font-medium text-warning"> · выключена</span>}
            {r.auto > 0 && <span> · авто: {r.auto}</span>}
          </div>
        </div>
        {/* телефон: показатели — второй строкой на всю ширину; компьютер — в ряд с названием */}
        <div className="order-3 grid basis-full grid-cols-4 gap-2 sm:order-2 sm:w-80 sm:basis-auto sm:gap-3">
          <Metric value={String(r.total)} label="заявок" />
          <Metric value={r.onTimePct != null ? `${r.onTimePct} %` : "—"} label="в срок" title={r.avgDays != null ? `В среднем ${r.avgDays} дн.` : undefined} bad={r.onTimePct != null && r.onTimePct < 80} />
          <Metric value={String(r.overdueNow || "—")} label="просрочка" bad={r.overdueNow > 0} />
          <Metric value={r.rating != null ? String(r.rating) : "—"} label="оценка" />
        </div>
        {canEdit && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn("order-2 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 sm:order-3 text-sm font-semibold transition", open ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
            <Settings2 size={15} /> {open ? "Свернуть" : "Настроить"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-3 sm:p-4">
          <div className="mb-2 text-sm font-semibold">Настройки: {r.title}</div>
          <ServiceSettings typeId={r.id} slaDays={r.slaDays} autoIssue={r.autoIssue} enabled={r.enabled} canAuto={r.isCertificate} canEdit />
        </div>
      )}
    </li>
  );
}

/** Форма настроек услуги: срок, автовыдача, доступность. */
export function ServiceSettings({ typeId, slaDays, autoIssue, enabled, canAuto, canEdit }: { typeId: string; slaDays: number; autoIssue: boolean; enabled: boolean; canAuto: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState<SvcState, FormData>(updateServiceAction.bind(null, typeId), {});
  if (!canEdit)
    return (
      <span className="text-[13px] text-muted">
        {slaDays} р. дн.{autoIssue ? " · авто" : ""}
        {!enabled ? " · выкл." : ""}
      </span>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <label className="inline-flex items-center gap-2">
        Срок
        <input type="number" name="slaDays" min={1} max={30} defaultValue={slaDays} className="min-h-10 w-16 rounded-xl border border-border bg-surface px-2 text-center tabular-nums" aria-label="Срок, рабочих дней" />
        р. дн.
      </label>
      <label className={cn("inline-flex min-h-10 items-center gap-2", !canAuto && "opacity-40")} title={canAuto ? "Выдавать сразу, без сотрудника" : "Автоматически — только справки без согласования"}>
        <input type="checkbox" name="autoIssue" defaultChecked={autoIssue} disabled={!canAuto} className="size-4 accent-[var(--ink)]" />
        Выдавать сразу
      </label>
      <label className="inline-flex min-h-10 items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-[var(--ink)]" />
        Доступна студентам
      </label>
      <button type="submit" disabled={pending} className="min-h-10 rounded-full bg-ink px-5 font-semibold text-ink-fg hover:opacity-90 disabled:opacity-50">
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
      {(state.ok || state.error) && <span className={state.error ? "font-medium text-danger" : "font-medium text-success"}>{state.error ?? state.ok}</span>}
    </form>
  );
}

export function RevokeButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-[13px] font-medium text-muted">{msg}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const reason = prompt("Причина отзыва справки (студент её увидит):");
        if (reason) start(async () => setMsg(((r) => r.error ?? r.ok ?? "")(await revokeCertificateAction(requestId, reason))));
      }}
      className="min-h-9 rounded-full border border-border px-3 text-[13px] font-semibold hover:border-danger hover:text-danger disabled:opacity-50"
    >
      Отозвать
    </button>
  );
}
