"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle, UserCheck } from "lucide-react";
import { Label, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { assignAction, changeStatusAction, type FormState } from "./actions";
import { replyTemplates } from "@/config/reply-templates";

const init: FormState = {};

export type NextRequest = { id: string; number: number; title: string } | null;

type Decision = { status: "IN_REVIEW" | "NEED_INFO" | "READY" | "DONE" | "REJECTED"; label: string; primary?: boolean; danger?: boolean };

/** Понятные решения вместо выбора «нового статуса» из списка. */
export function decisionsFor(status: string, isCertificate: boolean): Decision[] {
  if (status === "NEW") return [{ status: "IN_REVIEW", label: "Взять в работу", primary: true }, { status: "NEED_INFO", label: "Запросить уточнение" }, { status: "REJECTED", label: "Отклонить", danger: true }];
  if (status === "READY") return [{ status: "DONE", label: "Отметить выданной", primary: true }];
  if (status === "NEED_INFO") return [{ status: "IN_REVIEW", label: "Вернуть в работу", primary: true }, { status: "REJECTED", label: "Отклонить", danger: true }];
  return isCertificate
    ? [{ status: "READY", label: "Справка готова", primary: true }, { status: "NEED_INFO", label: "Запросить уточнение" }, { status: "REJECTED", label: "Отклонить", danger: true }]
    : [{ status: "DONE", label: "Одобрить", primary: true }, { status: "NEED_INFO", label: "Запросить уточнение" }, { status: "REJECTED", label: "Отклонить", danger: true }];
}

/** После решения — сразу предлагаем следующую заявку, чтобы не возвращаться в список. */
function NextLink({ next, className = "" }: { next: NextRequest; className?: string }) {
  if (!next) return <Link href="/staff" className={`inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2 ${className}`}>Вернуться к заявкам</Link>;
  return (
    <Link href={`/staff/requests/${next.id}`} className={`inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2 ${className}`}>
      Следующая: {next.title} № {next.number} <ArrowRight size={15} />
    </Link>
  );
}

export function DecisionForm({ id, status, isCertificate, next }: { id: string; status: string; isCertificate: boolean; next: NextRequest }) {
  const [state, action, pending] = useActionState(changeStatusAction, init);
  const [message, setMessage] = useState("");
  const decisions = decisionsFor(status, isCertificate);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Label htmlFor="message">Комментарий студенту</Label>
        <Textarea id="message" name="message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="Обязателен, если запрашиваете уточнение или отклоняете" />
        {/* шаблоны: подставить типовую фразу и поправить при необходимости */}
        <details className="group mt-2">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full px-1 text-sm font-semibold text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
            Шаблоны ответов <span className="ml-1 group-open:hidden">▾</span>
            <span className="ml-1 hidden group-open:inline">▴</span>
          </summary>
          <div className="mt-1 space-y-2">
            {replyTemplates.map((g) => (
              <div key={g.group}>
                <div className="mb-1 text-[13px] font-medium text-muted">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((t) => (
                    <button key={t} type="button" onClick={(e) => {
                        setMessage((m) => (m.trim() ? `${m.trim()} ${t}` : t));
                        // свернуть список, чтобы кнопки решения снова были рядом
                        const d = e.currentTarget.closest("details");
                        if (d) d.open = false;
                      }} className="rounded-2xl border border-border px-3 py-1.5 text-left text-[13px] leading-snug transition hover:border-ink">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      {state.ok && <NextLink next={next} />}
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

/**
 * Телефон: главное действие закреплено внизу экрана — не нужно листать до конца карточки.
 * Остальные решения (уточнение, отказ — с обязательным комментарием) — по кнопке «Другие действия».
 */
export function MobileDecisionBar({ id, status, isCertificate, closed, next }: { id: string; status: string; isCertificate: boolean; closed: boolean; next: NextRequest }) {
  const [state, action, pending] = useActionState(changeStatusAction, init);
  const primary = closed ? null : decisionsFor(status, isCertificate).find((d) => d.primary);
  const more = !closed && decisionsFor(status, isCertificate).length > 1;
  // когда карточка «Действия» уже на экране — панель не дублирует её кнопки
  const [actionsVisible, setActionsVisible] = useState(false);
  useEffect(() => {
    const el = document.getElementById("actions");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActionsVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (actionsVisible && !closed) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-border/70 bg-bg/90 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      {state.ok && (
        <p role="status" className="mb-2 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-success">
          <Check size={16} /> Готово.
          <NextLink next={next} className="text-fg" />
        </p>
      )}
      {state.error && <p role="alert" className="mb-2 text-sm font-semibold text-danger">{state.error}</p>}
      <div className="flex gap-2">
        {primary ? (
          <form action={action} className="flex-1">
            <input type="hidden" name="id" value={id} />
            <button type="submit" name="status" value={primary.status} disabled={pending} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 font-semibold text-ink-fg disabled:opacity-50">
              {pending && <LoaderCircle size={17} className="animate-spin" />}
              {primary.label}
            </button>
          </form>
        ) : next ? (
          <Link href={`/staff/requests/${next.id}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 font-semibold text-ink-fg">
            Следующая заявка <ArrowRight size={17} />
          </Link>
        ) : (
          <Link href="/staff" className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-ink px-4 font-semibold text-ink-fg">
            К списку заявок
          </Link>
        )}
        {more && (
          <a href="#actions" className="flex min-h-12 shrink-0 items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold">
            Другие действия
          </a>
        )}
      </div>
    </div>
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
