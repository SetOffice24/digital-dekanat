import Link from "next/link";
import { requireTeacher } from "@/server/auth";
import { RESULT_VALUES, teacherRetakes } from "@/server/services/academic";
import { PageHeader } from "@/components/ui";
import { addDays, fmtDateTime, moscowToday } from "@/lib/utils";
import { RetakeResultForm } from "./result-form";

export const metadata = { title: "Пересдачи" };

/** Пересдачи, которые назначил деканат: когда и кто, и результат — он сразу закрывает долг в успеваемости. */
export default async function TeacherRetakes() {
  const { teacher } = await requireTeacher();
  const rows = await teacherRetakes(teacher.id);
  const tomorrow = addDays(moscowToday(), 1);
  return (
    <>
      <Link href="/teacher" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Сегодня
      </Link>
      <PageHeader title="Пересдачи" subtitle="Назначает деканат по заявлению студента. Результат внесите после пересдачи — долг закроется в успеваемости сам." />
      {!rows.length ? (
        <p className="rounded-[24px] border border-dashed border-border p-6 text-center text-sm text-muted">Назначенных пересдач нет.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((e) => (
            <li key={e.id} className="rounded-[24px] border border-border/70 bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {e.student?.lastName} {e.student?.firstName} <span className="font-normal text-muted">· {e.student?.group.name}</span>
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {fmtDateTime(e.date)}, ауд. {e.room}
                </span>
              </div>
              <p className="mt-0.5 text-sm">{e.course.name}</p>
              {e.resultAt ? (
                <p className="mt-2 text-sm font-medium text-success">Результат внесён {fmtDateTime(e.resultAt)}</p>
              ) : e.date < tomorrow ? (
                <RetakeResultForm examId={e.id} values={RESULT_VALUES[e.course.assessment] ?? RESULT_VALUES.EXAM} />
              ) : (
                <p className="mt-2 text-[13px] text-muted">Результат можно внести в день пересдачи.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
