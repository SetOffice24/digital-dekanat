"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/staff/bits";
import { recordRetakeAction } from "./actions";

const label = (v: string) => (v === "PASS" ? "Зачтено" : v === "FAIL" ? "Не зачтено" : v);

export function RetakeResultForm({ examId, values }: { examId: string; values: string[] }) {
  const [state, action, pending] = useActionState(recordRetakeAction.bind(null, examId), {});
  if (state.ok) return <FormMessage ok={state.ok} />;
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      {values.map((v) => (
        <button key={v} type="submit" name="value" value={v} disabled={pending} onClick={(e) => !window.confirm(`Внести результат «${label(v)}»? Изменить его потом может только деканат.`) && e.preventDefault()} className="inline-flex min-h-10 min-w-12 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold hover:border-ink disabled:opacity-50">
          {label(v)}
        </button>
      ))}
      <FormMessage error={state.error} />
    </form>
  );
}
