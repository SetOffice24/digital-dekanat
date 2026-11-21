"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BedDouble, CheckCircle2, Clock, FileCheck2, FileSignature, GitBranch, LoaderCircle, MessageSquare, Sparkles, Stamp, TriangleAlert, Wallet, Zap } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { cn, plural } from "@/lib/utils";
import type { FieldDef } from "@/lib/request-fields";
import { createRequestAction, type FormState } from "../actions";

type T = { id: string; code: string; title: string; description: string; category: string; slaDays: number; needsPaper: boolean; isCertificate: boolean; fields: FieldDef[]; autoIssue: boolean; docs: { kind: string; title: string; required: boolean }[]; route: string[] };
/** Документ из «Моих документов», который можно приложить. */
export type MyDoc = { id: string; kind: string; status: string };

const catIcon: Record<string, React.ReactNode> = {
  Справки: <FileCheck2 size={20} />,
  Заявления: <FileSignature size={20} />,
  Обращения: <MessageSquare size={20} />,
  Выплаты: <Wallet size={20} />,
  Общежитие: <BedDouble size={20} />,
};

export function NewRequestForm({ types, initialCode, draftPayload, courses = [], myDocs = [], caseId = null }: { types: T[]; initialCode: string | null; draftPayload: Record<string, string> | null; courses?: string[]; myDocs?: MyDoc[]; caseId?: string | null }) {
  const [code, setCode] = useState<string | null>(types.some((t) => t.code === initialCode) ? initialCode : null);
  const [state, action, pending] = useActionState<FormState, FormData>(createRequestAction, {});
  const type = types.find((t) => t.code === code);
  const groups = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const t of types) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [types]);

  if (!type) {
    return (
      <div className="space-y-5">
        {groups.map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-2 text-[15px] font-bold">{cat}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((t) => (
                <button key={t.id} type="button" onClick={() => setCode(t.code)} className="flex gap-3 rounded-[24px] border border-border/70 bg-surface p-4 text-left transition hover:border-primary/50 hover:shadow-sm">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-p-mint text-[#0e0e10]">{catIcon[cat] ?? <FileCheck2 size={20} />}</span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug">{t.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.description}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
                      {t.autoIssue ? (
                        <span className="inline-flex items-center gap-1 text-success"><Zap size={12} /> сразу</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><Clock size={12} /> до {t.slaDays} {plural(t.slaDays, "рабочего дня", "рабочих дней", "рабочих дней")}</span>
                      )}
                      {t.route.length > 0 && <span className="inline-flex items-center gap-1"><GitBranch size={12} /> с согласованием</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // React 19 сбрасывает форму после action — восстанавливаем введённые значения из состояния
  const values = state.values ?? draftPayload ?? {};
  return (
    <form key={state.n ?? 0} action={action} className="mx-auto max-w-2xl space-y-4" noValidate>
      <button type="button" onClick={() => setCode(null)} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Другой тип
      </button>
      <div className="rounded-[24px] border border-border/70 bg-surface p-4">
        <div className="font-extrabold">{type.title}</div>
        <p className="mt-1 text-sm text-muted">{type.description}</p>
        {draftPayload && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
            <Sparkles size={13} /> Часть полей заполнена заранее — проверьте перед отправкой
          </p>
        )}
      </div>
      <input type="hidden" name="typeId" value={type.id} />
      {caseId && <input type="hidden" name="caseId" value={caseId} />}
      {(type.route.length > 0 || type.autoIssue) && (
        <div className="space-y-1.5 rounded-2xl bg-surface-2/60 p-3 text-[13px]">
          {type.autoIssue && <p className="flex items-center gap-1.5 font-semibold text-success"><Zap size={14} /> Готова сразу после отправки — данные уже есть в системе (кроме бумажной копии).</p>}
          {type.route.length > 0 && <p className="flex flex-wrap items-center gap-1"><GitBranch size={14} /> Путь заявки: {[...type.route, "Деканат"].join(" → ")}</p>}
        </div>
      )}
      {type.fields.map((f) => {
        const err = state.fieldErrors?.[f.name];
        const common = { id: `f_${f.name}`, name: `f_${f.name}`, defaultValue: values[f.name] ?? "", "aria-invalid": !!err, "aria-describedby": err ? `e_${f.name}` : undefined };
        return (
          <div key={f.name}>
            <Label htmlFor={`f_${f.name}`}>
              {f.label}
              {f.required && <span className="text-danger"> *</span>}
            </Label>
            {f.type === "textarea" ? (
              <Textarea {...common} placeholder={f.placeholder} />
            ) : f.type === "course" ? (
              <Select {...common} defaultValue={values[f.name] || ""}>
                <option value="" disabled>Выберите дисциплину</option>
                {courses.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : f.type === "select" ? (
              <Select {...common} defaultValue={values[f.name] || f.options?.[0]}>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : (
              <Input {...common} type={f.type === "date" ? "date" : "text"} placeholder={f.placeholder} />
            )}
            {err && (
              <p id={`e_${f.name}`} className="mt-1 text-sm text-danger">
                {err}
              </p>
            )}
          </div>
        );
      })}
      {type.isCertificate && (
        <label className={cn("flex cursor-pointer gap-3 rounded-2xl border p-4", type.needsPaper ? "border-warning/40 bg-warning-soft" : "border-border bg-surface")}>
          <input type="checkbox" name="wantsPaper" defaultChecked={state.values ? state.values.wantsPaper === "on" : type.needsPaper} className="mt-1 size-5 accent-[var(--primary)]" />
          <span>
            <span className="flex items-center gap-1.5 font-bold">
              <Stamp size={16} /> Нужна бумажная копия с печатью
            </span>
            <span className="mt-0.5 block text-[13px] text-muted">
              {type.needsPaper ? "Военкомат обычно принимает только бумажный оригинал. Электронная версия с QR будет доступна сразу." : "Для военкомата и некоторых банков. Электронная версия с QR-кодом будет в любом случае."}
            </span>
          </span>
        </label>
      )}
      {type.docs.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">Документы</legend>
          {type.docs.map((d) => {
            const mine = myDocs.find((x) => x.kind === d.kind);
            return mine ? (
              <label key={d.kind} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-success/30 bg-success-soft/50 p-3 text-sm">
                <input type="checkbox" name="docIds" value={mine.id} defaultChecked className="size-5 accent-[var(--primary)]" />
                <CheckCircle2 size={17} className="shrink-0 text-success" />
                <span className="min-w-0 flex-1"><b>{d.title}</b> — приложится из «Моих документов»{mine.status === "VERIFIED" ? " (проверен)" : ""}</span>
              </label>
            ) : (
              <div key={d.kind} className={cn("flex items-center gap-3 rounded-2xl p-3 text-sm", d.required ? "bg-warning-soft" : "bg-surface-2/60")}>
                <TriangleAlert size={17} className={cn("shrink-0", d.required ? "text-warning" : "text-muted")} />
                <span className="min-w-0 flex-1"><b>{d.title}</b>{d.required ? " — обязателен" : " — по желанию"}. Загрузите один раз, дальше будет подставляться сам.</span>
                <Link href={`/services/documents?kind=${d.kind}&back=${encodeURIComponent(`/requests/new?type=${type.code}${caseId ? `&case=${caseId}` : ""}`)}`} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-ink-fg">Загрузить</Link>
              </div>
            );
          })}
        </fieldset>
      )}
      <div>
        <Label htmlFor="comment">Комментарий</Label>
        <Textarea id="comment" name="comment" placeholder="Необязательно" className="min-h-20" defaultValue={values.comment ?? ""} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending || type.docs.some((d) => d.required && !myDocs.some((x) => x.kind === d.kind))}>
        {pending && <LoaderCircle size={18} className="animate-spin" />}
        {pending ? "Отправляем…" : type.route.length ? "Отправить на согласование" : "Отправить в деканат"}
      </Button>
    </form>
  );
}
