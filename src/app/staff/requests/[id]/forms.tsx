"use client";
import { useActionState } from "react";
import { UserCheck } from "lucide-react";
import { Label, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { assignAction, changeStatusAction, type FormState } from "./actions";

const init: FormState = {};

type Decision = { status: "IN_REVIEW" | "NEED_INFO" | "READY" | "DONE" | "REJECTED"; label: string; primary?: boolean; danger?: boolean };

/** Понятные решения вместо выбора «нового статуса» из списка. */
function decisionsFor(status: string, isCertificate: boolean): Decision[] {
  if (status === "NEW") return [{ status: "IN_REVIEW", label: "Взять в работу", primary: true }, { status: "NEED_INFO", label: "Запросить уточнение" }, { status: "REJECTED", label: "Отклонить", danger: true }];
  if (status === "READY") return [{ status: "DONE", label: "Отметить выданной", primary: true }];
  if (status === "NEED_INFO") return [{ status: "IN_REVIEW", label: "Вернуть в работу", primary: true }, { status: "REJECTED", label: "Отклонить", danger: true }];
  return isCertificate
    ? [{ status: "READY", label: "Справка готова", primary: true }, { status: "NEED_INFO", label: "Запросить уточнение" }, { status: "REJECTED", label: "Отклонить", danger: true }]
    : [{ status: "DONE", label: "Одобрить", primary: true }, { status: "NEED_INFO", label: "Запросить уточнение" }, { status: "REJECTED", label: "Отклонить", danger: true }];
}

export function DecisionForm({ id, status, isCertificate }: { id: string; status: string; isCertificate: boolean }) {
  const [state, action, pending] = useActionState(changeStatusAction, init);
  const decisions = decisionsFor(status, isCertificate);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Label htmlFor="message">Комментарий студенту</Label>
        <Textarea id="message" name="message" maxLength={1000} placeholder="Обязателен, если запрашиваете уточнение или отклоняете" />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex flex-col gap-2">
        {decisions.map((d) => (
          <button
            key={d.status}
            type="submit"
            name="status"
            value={d.status}
            disabled={pending}
            className={
              d.primary
                ? "min-h-12 rounded-full bg-ink px-5 font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50"
                : d.danger
                  ? "min-h-11 rounded-full px-5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-50"
                  : "min-h-11 rounded-full border border-border px-5 text-sm font-semibold transition hover:border-ink disabled:opacity-50"
            }
          >
            {d.label}
          </button>
        ))}
      </div>
    </form>
  );
}
export function AssignForm({ id }: { id: string }) {
  const [state, action] = useActionState(assignAction, init);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" className="w-full" pendingText="Назначаем…">
        <UserCheck size={18} /> Назначить себя исполнителем
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
