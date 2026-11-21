"use client";
import { useActionState, useState, useTransition } from "react";
import { revokeCertificateAction, updateServiceAction, type SvcState } from "@/app/service-actions";

/** Настройки услуги в строке таблицы: срок, автовыдача, доступность. */
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
    <form action={action} className="flex flex-wrap items-center gap-2 text-[13px]">
      <label className="inline-flex items-center gap-1">
        <input type="number" name="slaDays" min={1} max={30} defaultValue={slaDays} className="min-h-9 w-14 rounded-lg border border-border bg-surface px-2 text-center" aria-label="Срок, рабочих дней" />
        дн.
      </label>
      <label className={canAuto ? "inline-flex items-center gap-1" : "inline-flex items-center gap-1 opacity-40"} title={canAuto ? "Выдавать сразу, без сотрудника" : "Автоматически — только справки без согласования"}>
        <input type="checkbox" name="autoIssue" defaultChecked={autoIssue} disabled={!canAuto} className="size-4 accent-[var(--primary)]" />
        авто
      </label>
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-[var(--primary)]" />
        доступна
      </label>
      <button type="submit" disabled={pending} className="min-h-9 rounded-full border border-border px-3 font-semibold hover:border-ink disabled:opacity-50">
        {pending ? "…" : "Сохранить"}
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
