"use client";
import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, Clock, FileCheck2, FileSignature, LoaderCircle, MessageSquare, Sparkles, Stamp } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { cn, plural } from "@/lib/utils";
import type { FieldDef } from "@/lib/request-fields";
import { createRequestAction, type FormState } from "../actions";

type T = { id: string; code: string; title: string; description: string; category: string; slaDays: number; needsPaper: boolean; isCertificate: boolean; fields: FieldDef[] };

const catIcon: Record<string, React.ReactNode> = {
  Справки: <FileCheck2 size={20} />,
  Заявления: <FileSignature size={20} />,
  Обращения: <MessageSquare size={20} />,
};

export function NewRequestForm({ types, initialCode, draftPayload }: { types: T[]; initialCode: string | null; draftPayload: Record<string, string> | null }) {
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {list.map((t) => (
                <button key={t.id} type="button" onClick={() => setCode(t.code)} className="flex gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-primary/50 hover:shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{catIcon[cat] ?? <FileCheck2 size={20} />}</span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug">{t.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.description}</span>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-muted">
                      <Clock size={12} /> до {t.slaDays} {plural(t.slaDays, "рабочего дня", "рабочих дней", "рабочих дней")}
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
    <form key={state.n ?? 0} action={action} className="space-y-4" noValidate>
      <button type="button" onClick={() => setCode(null)} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Другой тип
      </button>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="font-extrabold">{type.title}</div>
        <p className="mt-1 text-sm text-muted">{type.description}</p>
        {draftPayload && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
            <Sparkles size={13} /> Заполнено помощником — проверьте перед отправкой
          </p>
        )}
      </div>
      <input type="hidden" name="typeId" value={type.id} />
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
      <div>
        <Label htmlFor="comment">Комментарий для деканата</Label>
        <Textarea id="comment" name="comment" placeholder="Необязательно" className="min-h-20" defaultValue={values.comment ?? ""} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <LoaderCircle size={18} className="animate-spin" />}
        {pending ? "Отправляем…" : "Отправить в деканат"}
      </Button>
    </form>
  );
}
