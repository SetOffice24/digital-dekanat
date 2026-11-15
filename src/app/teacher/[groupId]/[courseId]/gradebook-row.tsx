"use client";
import { useActionState, useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { addGradeAction, deleteGradeAction, type GradeState } from "./actions";

export type RowGrade = { id: string; kind: string; points: number | null; value: string; date: string; note: string | null };
export type Row = { enrollmentId: string; name: string; subgroup: number; grades: RowGrade[]; total: number };

const initial: GradeState = {};

function Chip({ g }: { g: RowGrade }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const label = `${g.note ?? "Оценка"} · ${g.date}`;
  return (
    <span title={err ?? label} className={`inline-flex items-center gap-0.5 rounded-full bg-surface-2 py-1 pl-3 text-sm font-bold ${g.kind === "CURRENT" ? "pr-1" : "pr-3"} ${pending ? "opacity-50" : ""} ${err ? "ring-2 ring-danger/50" : ""}`}>
      <span aria-label={label}>{g.points ?? g.value}</span>
      {g.kind === "CURRENT" && (
        <button
          type="button"
          disabled={pending}
          aria-label={`Удалить оценку ${g.points ?? g.value} (${label})`}
          className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
          onClick={() => {
            // защита от случайного нажатия: оценка исчезнет у студента
            if (!window.confirm(`Удалить оценку ${g.points ?? g.value} (${label})? Студент её больше не увидит.`)) return;
            start(async () => setErr((await deleteGradeAction(g.id)).error ?? null));
          }}
        >
          <X size={14} />
        </button>
      )}
    </span>
  );
}

export function GradebookRow({ row, kinds, max }: { row: Row; kinds: readonly string[]; max: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: GradeState, form: FormData) => {
    const r = await addGradeAction(prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, initial);

  return (
    <li className="rounded-[28px] border border-border/70 bg-surface p-4 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_4rem_auto] md:items-center md:gap-4 md:rounded-none md:border-0 md:border-b md:bg-transparent md:px-2 md:py-3 md:last:border-b-0">
      <div className="min-w-0">
        <div className="font-semibold leading-tight">{row.name}</div>
        <div className="mt-0.5 text-xs text-muted">подгруппа {row.subgroup}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 md:mt-0">
        {row.grades.length === 0 ? <span className="text-sm text-muted">Оценок пока нет</span> : row.grades.map((g) => <Chip key={g.id} g={g} />)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 md:contents">
        <div className="md:text-center" title="Сумма баллов за семестр">
          <span className="text-xs text-muted md:hidden">Сумма: </span>
          <span className="font-head text-xl font-semibold">{row.total}</span>
        </div>
        <Button variant={open ? "secondary" : "primary"} className="min-h-11 px-4" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? (
            "Отмена"
          ) : (
            <>
              <Plus size={18} /> Оценка
            </>
          )}
        </Button>
      </div>

      {open && (
        <form action={action} className="mt-3 grid gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end md:col-span-full">
          <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
          <label className="block text-[13px] font-medium text-fg/80">
            Баллы (0–{max})
            <Input name="points" type="number" inputMode="numeric" min={0} max={max} step={1} required autoFocus placeholder="0" className="mt-1.5 bg-surface text-center text-2xl font-bold" />
          </label>
          <label className="block text-[13px] font-medium text-fg/80">
            Вид работы
            <Select name="note" defaultValue={kinds[0]} className="mt-1.5 bg-surface">
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </label>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Ставим…" : "Поставить"}
          </Button>
          {state.error && (
            <p role="alert" className="text-sm font-medium text-danger sm:col-span-3">
              {state.error}
            </p>
          )}
        </form>
      )}
      {!open && state.ok && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success md:col-span-full md:mt-1">
          <Check size={16} /> {state.ok}
        </p>
      )}
    </li>
  );
}
