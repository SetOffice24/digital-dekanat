"use client";
import { useActionState, useTransition } from "react";
import { Send } from "lucide-react";
import { FormMessage } from "@/components/staff/bits";
import { closeCaseAction, markReadAction, notifyTeachersAction, type ActState } from "../../actions";

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

/** «Предупредить преподавателей»: даты и (по желанию) пара слов — уйдёт всем преподавателям группы. */
export function NotifyTeachersForm({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState<ActState, FormData>(notifyTeachersAction.bind(null, caseId), {});
  return (
    <form action={action} className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[13px] font-semibold">
          С
          <input type="date" name="from" required defaultValue={today()} className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
        </label>
        <label className="text-[13px] font-semibold">
          По
          <input type="date" name="to" required defaultValue={today()} className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
        </label>
      </div>
      <input name="note" maxLength={200} placeholder="Например: контрольную напишу после выздоровления" className="block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
      <FormMessage error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-50">
        <Send size={14} /> {pending ? "Отправляем…" : "Отправить преподавателям"}
      </button>
    </form>
  );
}

export function ReadButton({ caseId, stepKey }: { caseId: string; stepKey: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => markReadAction(caseId, stepKey))} className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50">
      Прочитал(а)
    </button>
  );
}

export function CaseFooter({ caseId, complete }: { caseId: string; complete: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {complete && (
        <button type="button" disabled={pending} onClick={() => start(() => closeCaseAction(caseId, "DONE"))} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-ink-fg disabled:opacity-50">
          Всё сделано — завершить
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => confirm("Закрыть план? Поданные заявки останутся в работе.") && start(() => closeCaseAction(caseId, "CANCELLED"))} className="inline-flex min-h-12 items-center rounded-full px-5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50">
        Больше не актуально
      </button>
    </div>
  );
}
