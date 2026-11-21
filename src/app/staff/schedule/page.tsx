import Link from "next/link";
import { CalendarOff, ChevronLeft, ChevronRight, UserCheck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups, listLessons } from "@/server/repos/staff";
import { EmptyState, PageHeader } from "@/components/ui";
import { lessonKindLabel } from "@/lib/labels";
import { addDays, cn, fmtDay, fmtWeekdayShort, isoDate, mondayOf, moscowToday, parseIsoDate, roomLabel } from "@/lib/utils";
import { GroupPicker, LessonActions } from "./forms";

export const metadata = { title: "Расписание" };

/**
 * Расписание для деканата: группа → день недели → пары одним списком.
 * Перенос и отмена — компактные кнопки в строке, форма раскрывается по нажатию.
 */
export default async function StaffSchedule({ searchParams }: { searchParams: Promise<{ group?: string; date?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const groups = await listGroups(staff);
  // по умолчанию — ИВТ-24-1 (в демо) и ближайший учебный день
  const group = groups.find((g) => g.id === sp.group) ?? groups.find((g) => g.name === "ИВТ-24-1") ?? groups[0];
  const today = moscowToday();
  const date = parseIsoDate(sp.date) ?? (today.getUTCDay() === 0 ? addDays(today, 1) : today);
  const lessons = group ? await listLessons(staff, group.id, date) : [];
  const monday = mondayOf(date);
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const href = (d: Date) => `/staff/schedule?group=${group?.id ?? ""}&date=${isoDate(d)}`;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Расписание" subtitle={group ? `${group.name} · ${fmtDay(date)}` : undefined} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <GroupPicker groups={groups} value={group?.id} date={isoDate(date)} />
        <nav className="flex items-center gap-1" aria-label="День недели">
          <Link href={href(addDays(monday, -7))} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface" aria-label="Предыдущая неделя">
            <ChevronLeft size={18} />
          </Link>
          <div className="grid flex-1 grid-cols-6 gap-1">
            {days.map((d) => {
              const active = isoDate(d) === isoDate(date);
              const isToday = isoDate(d) === isoDate(today);
              return (
                <Link key={isoDate(d)} href={href(d)} aria-current={active ? "date" : undefined} className={cn("flex min-h-12 min-w-11 flex-col items-center justify-center rounded-2xl text-sm transition", active ? "bg-ink text-ink-fg" : "hover:bg-surface", isToday && !active && "ring-1 ring-border")}>
                  <span className={cn("text-[11px] uppercase", active ? "text-ink-fg/70" : "text-muted")}>{fmtWeekdayShort(d)}</span>
                  <span className="font-semibold tabular-nums">{d.getUTCDate()}</span>
                </Link>
              );
            })}
          </div>
          <Link href={href(addDays(monday, 7))} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface" aria-label="Следующая неделя">
            <ChevronRight size={18} />
          </Link>
        </nav>
      </div>

      {lessons.length ? (
        <ol className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {lessons.map((l, i) => {
            const cancelled = l.status === "CANCELLED";
            return (
              <li key={l.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:flex-nowrap sm:px-5 [&:has([aria-expanded=true])]:flex-wrap", i > 0 && "border-t border-border/60")}>
                <div className="w-14 shrink-0 leading-tight">
                  <div className={cn("font-head text-lg font-semibold tabular-nums", cancelled && "text-muted line-through")}>{l.startTime}</div>
                  <div className="text-xs text-muted tabular-nums">{l.endTime}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-semibold leading-snug", cancelled && "text-muted line-through")}>{l.course.name}</div>
                  <div className="mt-0.5 text-sm text-muted">
                    {lessonKindLabel[l.kind]} · {roomLabel(l.room)}, {l.building} · {l.teacher.fullName}
                    {l.subgroup ? ` · подгр. ${l.subgroup}` : ""}
                  </div>
                  {l.status !== "SCHEDULED" && (
                    <div className={cn("mt-1 text-sm font-medium", cancelled ? "text-danger" : "text-warning")}>
                      {cancelled ? "Отменено" : "Изменено"}
                      {l.changeNote ? `: ${l.changeNote}` : ""}
                    </div>
                  )}
                </div>
                {!cancelled && l.date.getTime() <= today.getTime() && (
                  <Link href={`/staff/attendance/lesson/${l.id}`} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-semibold text-ink-fg hover:opacity-90">
                    <UserCheck size={15} /> Посещаемость
                  </Link>
                )}
                {!cancelled && <LessonActions id={l.id} date={isoDate(l.date)} room={l.room} start={l.startTime} end={l.endTime} />}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon={<CalendarOff size={22} />} title="В этот день занятий нет" text="Выберите другой день или группу." />
      )}
    </div>
  );
}
