"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/staff/bits";
import { recordRecreditAction, scheduleRetakeAction, staffRetakeResultAction, type FormState } from "./actions";

const field = "mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm";
const label = (v: string) => (v === "PASS" ? "зачтено" : v === "FAIL" ? "не зачтено" : v);

export type RetakeOpts = {
  debts: { enrollmentId: string; courseId: string; course: string; semester: number }[];
  suggested: string | null;
  teachers: { id: string; fullName: string; courses: string[]; hasAccount: boolean }[];
  exam: { id: string; date: string; time: string; room: string; teacherId: string | null; enrollmentId: string | null; resultAt: string | null; canResult: boolean; values: string[] } | null;
};

/** Результат пересдачи из бумажной ведомости — когда пересдача уже прошла. */
function StaffResult({ requestId, examId, values }: { requestId: string; examId: string; values: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(staffRetakeResultAction.bind(null, requestId, examId), {});
  if (state.ok) return <FormMessage ok={state.ok} />;
  return (
    <form action={action} className="mb-4 space-y-2 rounded-2xl bg-p-mint/50 p-3 text-sm">
      <p className="font-medium">Пересдача прошла. Результат по ведомости:</p>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button key={v} type="submit" name="value" value={v} disabled={pending} onClick={(e) => !window.confirm(`Внести результат «${label(v)}»?`) && e.preventDefault()} className="inline-flex min-h-10 min-w-12 items-center justify-center rounded-full border border-border bg-surface px-4 font-semibold hover:border-ink disabled:opacity-50">
            {label(v)}
          </button>
        ))}
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}

/** Назначение пересдачи: дисциплина с долгом, дата и время, аудитория, кто принимает. Перенос — та же форма. */
export function RetakeForm({ requestId, o }: { requestId: string; o: RetakeOpts }) {
  const [state, action, pending] = useActionState<FormState, FormData>(scheduleRetakeAction.bind(null, requestId), {});
  if (o.exam?.resultAt) return <p className="text-sm text-muted">Результат пересдачи внесён преподавателем {o.exam.resultAt}.</p>;
  if (o.exam?.canResult) return <StaffResult requestId={requestId} examId={o.exam.id} values={o.exam.values} />;
  if (!o.debts.length) return <p className="text-sm text-muted">У студента нет задолженностей в прошлых семестрах — назначать нечего. Уточните у студента или отклоните заявку.</p>;
  return (
    <form action={action} className="space-y-3 text-sm">
      <label className="block">
        <span className="font-medium">Дисциплина с долгом</span>
        <select name="enrollmentId" defaultValue={o.exam?.enrollmentId ?? o.suggested ?? ""} className={field}>
          {o.debts.map((d) => (
            <option key={d.enrollmentId} value={d.enrollmentId}>
              {d.course} · {d.semester} семестр
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-medium">Дата</span>
          <input type="date" name="date" required defaultValue={o.exam?.date} className={field} />
        </label>
        <label className="block">
          <span className="font-medium">Время</span>
          <input type="time" name="time" required defaultValue={o.exam?.time ?? "10:00"} className={field} />
        </label>
      </div>
      <label className="block">
        <span className="font-medium">Аудитория</span>
        <input name="room" required maxLength={60} defaultValue={o.exam?.room} placeholder="Например, 401 В" className={field} />
      </label>
      <label className="block">
        <span className="font-medium">Принимает</span>
        <select name="teacherId" required defaultValue={o.exam?.teacherId ?? ""} className={field}>
          <option value="" disabled>
            Выберите преподавателя
          </option>
          {[
            ["Вели эти дисциплины", o.teachers.filter((t) => t.courses.length)],
            ["Другие преподаватели", o.teachers.filter((t) => !t.courses.length)],
          ].map(([title, list]) =>
            (list as RetakeOpts["teachers"]).length ? (
              <optgroup key={title as string} label={title as string}>
                {(list as RetakeOpts["teachers"]).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                    {t.hasAccount ? "" : " — без кабинета, результат внесёт деканат"}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </label>
      <FormMessage error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-5 font-semibold text-ink-fg disabled:opacity-50">
        {pending ? "Сохраняем…" : o.exam ? "Перенести пересдачу" : "Назначить пересдачу"}
      </button>
      <p className="text-[13px] text-muted">Студент увидит пересдачу в «Учёбе», преподаватель — в разделе «Пересдачи». Результат вносит преподаватель — долг закроется сам.</p>
    </form>
  );
}

/** Перезачёт: оценка из документа студента → в успеваемость, заявка — выполнена. */
export function RecreditForm({ requestId, o }: { requestId: string; o: { enrollment: { course: string; semester: number; values: string[]; hasFinal: boolean } | null; claimed: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordRecreditAction.bind(null, requestId), {});
  if (!o.enrollment) return <p className="text-sm text-muted">Дисциплины из заявки нет в учебном плане студента. Внесите результат вне сервиса и закройте заявку комментарием.</p>;
  if (o.enrollment.hasFinal) return <p className="text-sm text-muted">По дисциплине «{o.enrollment.course}» уже есть итоговая оценка.</p>;
  const values = o.enrollment.values.filter((v) => v !== "2" && v !== "FAIL");
  return (
    <form action={action} className="space-y-3 text-sm">
      <p>
        <b>{o.enrollment.course}</b> · {o.enrollment.semester} семестр. В документе студента: <b>{o.claimed || "—"}</b>
      </p>
      <label className="block">
        <span className="font-medium">Перезачтённая оценка</span>
        <select name="value" required defaultValue={values.includes(o.claimed) ? o.claimed : ""} className={field}>
          <option value="" disabled>
            Выберите
          </option>
          {values.map((v) => (
            <option key={v} value={v}>
              {label(v)}
            </option>
          ))}
        </select>
      </label>
      <FormMessage error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-5 font-semibold text-ink-fg disabled:opacity-50">
        {pending ? "Сохраняем…" : "Внести перезачёт и выполнить заявку"}
      </button>
    </form>
  );
}
