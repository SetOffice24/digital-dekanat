import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Check, MapPin, UserCheck, ClipboardCheck } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { listClasses, teachingDay } from "@/server/repos/teacher";
import { pendingReviews } from "@/server/repos/homework";
import { teacherOverview } from "@/server/repos/analytics";
import { countApprovals } from "@/server/services/requests";
import { absentStudents } from "@/server/services/teacher";
import { countRetakesToGrade } from "@/server/services/academic";
import { GitBranch, HeartPulse } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { lessonKindLabel } from "@/lib/labels";
import { cn, fmtDay, minutesOf, moscowTime, moscowToday, plural, roomLabel } from "@/lib/utils";

export const metadata = { title: "Сегодня" };

/**
 * Главная преподавателя — от пар дня: «какая пара → журнал этой группы».
 * Ниже — все группы для случаев, когда оценку нужно поставить не в день занятия.
 */
export default async function TeacherHome() {
  const { user, teacher } = await requireTeacher();
  const today = moscowToday();
  const [approvals, absent, retakes] = await Promise.all([countApprovals({ teacherId: teacher.id, userId: user.id }), absentStudents(teacher.id), countRetakesToGrade(teacher.id)]);
  const dm = (iso: string) => (iso ? iso.split("-").reverse().slice(0, 2).join(".") : "");
  const [day, classes, toReview, overview] = await Promise.all([teachingDay(teacher, today), listClasses(teacher), pendingReviews(teacher), teacherOverview(teacher)]);
  const ov = new Map(overview.map((o) => [o.groupId + o.courseId, o]));
  const nowMin = minutesOf(moscowTime());
  const active = day?.lessons.filter((l) => l.status !== "CANCELLED") ?? [];
  const next = day?.isToday ? active.find((l) => minutesOf(l.endTime) > nowMin) : active[0];
  const hour = Number(moscowTime().slice(0, 2));
  const hello = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  const summary = !day
    ? "В ближайшие две недели пар нет."
    : day.isToday
      ? next
        ? `Сегодня ${active.length} ${plural(active.length, "пара", "пары", "пар")}. Следующая — в ${next.startTime}, ${next.group.name}.`
        : `Сегодня ${active.length} ${plural(active.length, "пара", "пары", "пар")} — все уже прошли.`
      : `Сегодня пар нет. Ближайшие — ${fmtDay(day.date).toLowerCase()}.`;

  return (
    <>
      <PageHeader title={`${hello}!`} subtitle={summary} />

      {(approvals > 0 || absent.length > 0 || retakes > 0 || toReview > 0) && (
        <section className="mb-8 grid gap-2 lg:grid-cols-2">
          {toReview > 0 && (
            <Link href="/teacher/reviews" className="flex items-center gap-3 rounded-[24px] bg-p-sky/70 p-4 transition hover:opacity-90">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface">
                <Check size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  Проверить {toReview} {plural(toReview, "работу", "работы", "работ")}
                </span>
                <span className="block text-[13px]">Домашние задания — по заданиям, дольше ждущие сверху</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {retakes > 0 && (
            <Link href="/teacher/retakes" className="flex items-center gap-3 rounded-[24px] bg-p-mint/70 p-4 transition hover:opacity-90">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface">
                <ClipboardCheck size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Внесите результат пересдачи: {retakes}</span>
                <span className="block text-[13px]">Долг студента закроется в успеваемости сам</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {approvals > 0 && (
            <Link href="/teacher/approvals" className="flex items-center gap-3 rounded-[24px] bg-p-yellow/70 p-4 transition hover:opacity-90">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface">
                <GitBranch size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Ждут вашего согласования: {approvals}</span>
                <span className="block text-[13px]">Перезачёт дисциплины — решение за преподавателем</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {absent.length > 0 && (
            <div className="rounded-[24px] border border-border/70 bg-surface p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <HeartPulse size={18} className="text-danger" /> Заявления об отсутствии
              </div>
              <ul className="space-y-1.5 text-sm">
                {absent.slice(0, 6).map((a) => (
                  <li key={a.key} className={a.past ? "opacity-60" : undefined}>
                    <b>{a.name}</b> <span className="text-muted">· {a.group}</span>
                    {a.from && (
                      <span>
                        {" "}
                        · {dm(a.from)}–{dm(a.to)}
                        {a.past && <span className="text-muted"> (прошло)</span>}
                      </span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                      <span className={a.status === "confirmed" ? "rounded-full bg-success-soft px-2 font-semibold text-success" : a.status === "pending" ? "rounded-full bg-warning-soft px-2 font-semibold text-warning" : "rounded-full bg-surface-2 px-2 font-semibold"}>
                        {a.status === "confirmed" ? "уважительная — подтверждено" : a.status === "pending" ? "ещё не подтверждено" : "заявления нет"}
                      </span>
                      {a.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {day && (
        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
            <CalendarDays size={17} /> {day.isToday ? "Пары сегодня" : fmtDay(day.date)}
          </h2>
          <ol className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
            {day.lessons.map((l, i) => {
              const cancelled = l.status === "CANCELLED";
              const isNext = next?.id === l.id;
              const journal = `/teacher/${l.group.id}/${l.course.id}`;
              return (
                <li key={l.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:flex-nowrap sm:px-5", i > 0 && "border-t border-border/60", isNext && "bg-p-sky/40")}>
                  <div className="w-14 shrink-0 leading-tight">
                    <div className={cn("font-head text-lg font-semibold tabular-nums", cancelled && "text-muted line-through")}>{l.startTime}</div>
                    <div className="text-xs text-muted tabular-nums">{l.endTime}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn("font-semibold leading-snug", cancelled && "text-muted line-through")}>
                      {l.course.name} · {l.group.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                      {cancelled ? (
                        <span className="font-medium text-danger">Отменено</span>
                      ) : (
                        <>
                          {isNext && <span className="font-semibold text-fg">Следующая ·</span>}
                          <span>{lessonKindLabel[l.kind]}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} /> {roomLabel(l.room)}, {l.building}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {!cancelled && (
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Link href={`/teacher/lesson/${l.id}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg hover:opacity-90 sm:flex-none">
                        {l._count.attendance > 0 ? <Check size={15} /> : <UserCheck size={15} />} {l._count.attendance > 0 ? "Отмечено" : "Посещаемость"}
                      </Link>
                      <Link href={journal} className="inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-full border border-border px-4 text-sm font-semibold hover:border-ink sm:flex-none">
                        Журнал
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <h2 className="mb-3 text-[15px] font-bold">Все мои группы</h2>
      {classes.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="Пока нет групп" text="У вас нет назначенных занятий. Когда деканат добавит их в расписание, группы появятся здесь." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {classes.map((c) => (
            <li key={c.groupId + c.courseId} className="min-w-0">
              <Link href={`/teacher/${c.groupId}/${c.courseId}`} className="group flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-4 transition hover:border-ink">
                <span className="flex h-11 min-w-16 shrink-0 items-center justify-center rounded-2xl bg-p-lilac px-2 text-sm font-semibold text-[#0e0e10]">{c.groupName}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.courseName}</span>
                  <span className="block text-sm text-muted">
                    {c.studentCount} {plural(c.studentCount, "студент", "студента", "студентов")}
                    {ov.get(c.groupId + c.courseId)?.avgRatio != null && ` · средний ${Math.round(ov.get(c.groupId + c.courseId)!.avgRatio! * 100)}%`}
                  </span>
                  {(() => {
                    // коротко, что требует внимания: ниже порога, пропуски подряд, несданные ДЗ
                    const o = ov.get(c.groupId + c.courseId);
                    const parts = o ? [o.below && `ниже порога: ${o.below}`, o.streak && `пропускают подряд: ${o.streak}`, o.missing && `не сдали ДЗ: ${o.missing}`].filter(Boolean) : [];
                    return parts.length ? <span className="block text-sm font-medium text-danger">{parts.join(" · ")}</span> : null;
                  })()}
                </span>
                <ArrowRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
