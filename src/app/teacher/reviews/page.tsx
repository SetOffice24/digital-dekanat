import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { reviewQueue } from "@/server/repos/homework";
import { PageHeader } from "@/components/ui";
import { fmtDateTime, plural } from "@/lib/utils";

export const metadata = { title: "Проверить работы" };

/** Все работы «на проверке» в одном месте: по заданиям, дольше всего ждущие — сверху. Проверка — в карточке задания. */
export default async function TeacherReviews() {
  const { teacher } = await requireTeacher();
  const groups = await reviewQueue(teacher);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <>
      <Link href="/teacher" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Сегодня
      </Link>
      <PageHeader title="Проверить работы" subtitle={total ? `${total} ${plural(total, "работа ждёт", "работы ждут", "работ ждут")} проверки` : "Все работы проверены"} />
      {!groups.length ? (
        <p className="rounded-[24px] border border-dashed border-border p-6 text-center text-sm text-muted">Новых сдач нет. Когда студент отправит работу, придёт уведомление.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.assignment.id}>
              <Link href={`/teacher/${g.assignment.groupId}/${g.assignment.courseId}/homework/${g.assignment.id}`} className="block rounded-[24px] border border-border/70 bg-surface p-4 transition hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">{g.assignment.title}</div>
                    <div className="text-[13px] text-muted">
                      {g.assignment.group.name} · {g.assignment.course.name}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
                    {g.items.length} <ChevronRight size={16} />
                  </span>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {g.items.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {s.name}
                        {s.resubmitted && <span className="text-muted"> · исправленная</span>}
                        {s.late && <span className="text-warning"> · позже срока</span>}
                      </span>
                      <span className="tabular-nums text-muted">
                        {fmtDateTime(s.submittedAt)}
                        {s.waitDays >= 3 && <span className="font-medium text-danger"> · ждёт {s.waitDays} дн.</span>}
                      </span>
                    </li>
                  ))}
                  {g.items.length > 5 && <li className="text-muted">и ещё {g.items.length - 5}</li>}
                </ul>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
