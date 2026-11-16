import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, UserCheck } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getGradebook } from "@/server/repos/teacher";
import { courseAttendance } from "@/server/repos/attendance";
import { listAssignments } from "@/server/repos/homework";
import { EmptyState, PageHeader } from "@/components/ui";
import { CourseTabs } from "@/components/teacher/course-tabs";
import { lessonKindLabel } from "@/lib/labels";
import { cn, fmtWeekdayShort, fmtShort, moscowToday } from "@/lib/utils";

export const metadata = { title: "Посещаемость" };

/** Посещаемость дисциплины: прошедшие пары (отмечена или нет) и итог по каждому студенту. */
export default async function CourseAttendancePage({ params }: { params: Promise<{ groupId: string; courseId: string }> }) {
  const { groupId, courseId } = await params;
  const { teacher } = await requireTeacher();
  const today = moscowToday();
  const [book, data, hw] = await Promise.all([getGradebook(teacher, groupId, courseId), courseAttendance(teacher, groupId, courseId, today), listAssignments(teacher, groupId, courseId)]);
  if (!book || !data) notFound();
  const toReview = hw?.reduce((a, x) => a + x.toReview, 0) ?? 0;
  const unmarked = data.lessons.filter((l) => l.status !== "CANCELLED" && !l.marked).length;

  return (
    <>
      <Link href="/teacher" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> На главную
      </Link>
      <PageHeader title={`${book.course.name} · ${book.group.name}`} subtitle={unmarked ? `Не отмечено пар: ${unmarked}. Нажмите на пару, чтобы отметить, кто был.` : "Посещаемость всех прошедших пар отмечена."} />
      <CourseTabs groupId={groupId} courseId={courseId} active="attendance" toReview={toReview} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <h2 className="mb-2 text-[15px] font-bold">Прошедшие пары</h2>
          {data.lessons.length === 0 ? (
            <EmptyState icon={<UserCheck size={22} />} title="Пар ещё не было" text="После первой пары здесь можно будет отметить посещаемость." />
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
              {data.lessons.map((l) => {
                const cancelled = l.status === "CANCELLED";
                return (
                  <li key={l.id}>
                    <Link href={`/teacher/lesson/${l.id}`} className={cn("flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/60 sm:px-5", cancelled && "pointer-events-none opacity-60")}>
                      <div className="w-16 shrink-0 leading-tight">
                        <div className="font-semibold tabular-nums">{fmtShort(l.date)}</div>
                        <div className="text-xs text-muted">
                          {fmtWeekdayShort(l.date)}, {l.startTime}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 text-sm text-muted">
                        {lessonKindLabel[l.kind]}
                        {l.subgroup ? ` · подгр. ${l.subgroup}` : ""}
                      </div>
                      {cancelled ? (
                        <span className="shrink-0 text-xs font-medium text-muted">отменена</span>
                      ) : l.marked ? (
                        <span className="shrink-0 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
                          был {l.present} из {l.marked}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-p-yellow px-3 py-1 text-xs font-semibold text-[#0e0e10]">отметить</span>
                      )}
                      {!cancelled && <ChevronRight size={17} className="shrink-0 text-muted" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-bold">По студентам</h2>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
            {data.students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s.lastName} {s.firstName}
                </span>
                <span className="shrink-0 text-sm text-muted tabular-nums">{s.total ? `${s.present} из ${s.total}` : "—"}</span>
                <span className={cn("w-12 shrink-0 text-right font-semibold tabular-nums", s.percent != null && s.percent < 80 && "text-danger")}>{s.percent != null ? `${s.percent}%` : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Ниже 80% — выделено красным: студента стоит предупредить о допуске.</p>
        </section>
      </div>
    </>
  );
}
