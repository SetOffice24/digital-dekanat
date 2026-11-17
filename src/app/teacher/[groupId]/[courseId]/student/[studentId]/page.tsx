import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getGradebook } from "@/server/repos/teacher";
import { teacherStudentCard } from "@/server/repos/analytics";
import { PageHeader } from "@/components/ui";
import { forecastLabel, isBelow } from "@/lib/grading";
import { hwState } from "@/lib/homework";
import { lessonKindLabel } from "@/lib/labels";
import { cn, fmtDateTime, fmtShort } from "@/lib/utils";

export const metadata = { title: "Студент" };

const dm = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });

/** Студент глазами преподавателя — только в разрезе его дисциплины: оценки, посещения, домашние задания. */
export default async function TeacherStudentPage({ params }: { params: Promise<{ groupId: string; courseId: string; studentId: string }> }) {
  const { groupId, courseId, studentId } = await params;
  const { teacher } = await requireTeacher();
  const [book, card] = await Promise.all([getGradebook(teacher, groupId, courseId), teacherStudentCard(teacher, groupId, courseId, studentId)]);
  if (!book || !card) notFound();
  const s = card.student;
  const bad = card.score ? isBelow(card.score.forecast) : false;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href={`/teacher/${groupId}/${courseId}`} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Журнал
      </Link>
      <PageHeader title={[s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ")} subtitle={`${s.group.name}, подгруппа ${s.subgroup} · ${book.course.name}`} action={<Link href={`/teacher/messages/new?to=${s.userId}&ctx=COURSE&id=${courseId}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-ink"><MessagesSquare size={16} /> Написать студенту</Link>} />

      <div className="mb-6 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border/70 bg-surface p-3">
          <div className={cn("font-head text-xl font-semibold tabular-nums sm:text-2xl", bad && "text-danger")}>{card.score ? `${card.score.points}/${card.score.max}` : "—"}</div>
          <div className={cn("text-xs", bad ? "font-semibold text-danger" : "text-muted")}>{card.score ? forecastLabel(card.score.forecast) : "оценок нет"}</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-surface p-3">
          <div className={cn("font-head text-xl font-semibold tabular-nums sm:text-2xl", card.attendance.percent != null && card.attendance.percent < 80 && "text-danger")}>{card.attendance.percent != null ? `${card.attendance.percent}%` : "—"}</div>
          <div className="text-xs text-muted">посещаемость</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-surface p-3">
          <div className="font-head text-xl font-semibold tabular-nums sm:text-2xl">
            {card.homework.filter((h) => h.state === "accepted" || h.state === "submitted" || h.state === "returned").length}/{card.homework.filter((h) => h.state !== "todo").length}
          </div>
          <div className="text-xs text-muted">ДЗ сдано (срок прошёл или сдано)</div>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-[15px] font-bold">Оценки</h2>
        {card.grades.length === 0 ? (
          <p className="rounded-[24px] border border-border/70 bg-surface px-4 py-3 text-sm text-muted">Оценок пока нет.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
            {card.grades.map((g, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span>
                  <span className="text-muted tabular-nums">{dm.format(g.date)}</span> · {g.note ?? "Оценка"}
                </span>
                <span className="font-semibold tabular-nums">
                  {g.points ?? g.value}
                  <span className="font-normal text-muted">/20</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-[15px] font-bold">Домашние задания</h2>
        {card.homework.length === 0 ? (
          <p className="rounded-[24px] border border-border/70 bg-surface px-4 py-3 text-sm text-muted">Заданий не было.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
            {card.homework.map((h) => (
              <li key={h.id}>
                <Link href={`/teacher/${groupId}/${courseId}/homework/${h.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.title}</span>
                    <span className="text-xs text-muted">
                      до {fmtDateTime(h.dueAt)}
                      {h.submittedAt && h.submittedAt > h.dueAt && " · сдано позже срока"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", hwState[h.state].cls)}>{hwState[h.state].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-bold">Посещения</h2>
        {card.attendance.list.length === 0 ? (
          <p className="rounded-[24px] border border-border/70 bg-surface px-4 py-3 text-sm text-muted">Отметок пока нет.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
            {card.attendance.list.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span>
                  {fmtShort(a.lesson.date)}, {a.lesson.startTime} · <span className="text-muted">{lessonKindLabel[a.lesson.kind]}</span>
                </span>
                <span className={cn("rounded-full px-3 py-0.5 text-xs font-semibold", a.present ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{a.present ? "Был" : "Пропуск"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
