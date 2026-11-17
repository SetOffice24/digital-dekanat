"use client";
import { useActionState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Select } from "@/components/ui";
import { CredentialsCard } from "@/components/staff/credentials-card";
import { createStudentAction } from "../actions";

const field = "w-full min-h-12 rounded-2xl border border-border bg-surface px-4 text-[15px] outline-none focus:ring-2 focus:ring-ink/30";
type State = { ok?: string; error?: string; password?: string; login?: string; studentId?: string };

/** Новый студент: ФИО, группа, подгруппа, № зачётки. Зачисление на дисциплины группы — автоматически. */
export function NewStudentForm({ groups, defaultGroup }: { groups: { id: string; name: string; course: number }[]; defaultGroup?: string }) {
  const [state, action, pending] = useActionState<State, FormData>(createStudentAction, {});

  if (state.ok && state.login && state.password) {
    return (
      <div className="space-y-4">
        <p className="font-medium text-success">{state.ok}.</p>
        <CredentialsCard login={state.login} password={state.password} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/staff/students/${state.studentId}`} className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg">
            Открыть личное дело
          </Link>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold hover:border-ink">
            Добавить ещё
          </button>
        </div>
      </div>
    );
  }

  const f = (name: string, label: string, opts: { required?: boolean; placeholder?: string; type?: string; autoComplete?: string } = {}) => (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
        {!opts.required && <span className="font-normal text-muted"> — необязательно</span>}
      </label>
      <input id={name} name={name} type={opts.type ?? "text"} required={opts.required} placeholder={opts.placeholder} autoComplete={opts.autoComplete ?? "off"} className={field} />
    </div>
  );

  return (
    <form action={action} className="space-y-4 rounded-[28px] border border-border/70 bg-surface p-5" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {f("lastName", "Фамилия", { required: true })}
        {f("firstName", "Имя", { required: true })}
        {f("middleName", "Отчество")}
        {f("recordBookNo", "№ зачётной книжки", { required: true, placeholder: "например, 25-ИВТ-0150" })}
        <div>
          <label htmlFor="groupId" className="mb-1.5 block text-sm font-medium">
            Группа
          </label>
          <Select id="groupId" name="groupId" defaultValue={defaultGroup ?? groups[0]?.id} className="w-full">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} · {g.course} курс
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Подгруппа</span>
          <div className="flex gap-2">
            {[1, 2].map((n) => (
              <label key={n} className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-ink-fg">
                <input type="radio" name="subgroup" value={n} defaultChecked={n === 1} className="sr-only" /> {n}
              </label>
            ))}
          </div>
        </div>
      </div>
      {f("email", "Почта", { type: "email", placeholder: "для писем из деканата" })}
      <p className="text-xs text-muted">Логин составится из имени и фамилии латиницей. Студент будет зачислен на дисциплины текущего семестра группы и при первом входе задаст свой пароль.</p>
      {state.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-ink-fg disabled:opacity-60">
        {pending && <LoaderCircle size={18} className="animate-spin" />} Добавить студента
      </button>
    </form>
  );
}
