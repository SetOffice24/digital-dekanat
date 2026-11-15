import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, PartyPopper, TriangleAlert } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getLessons } from "@/server/repos/student";
import { LessonItem } from "@/components/lesson-item";
import { EmptyState, PageHeader } from "@/components/ui";
import { addDays, cn, fmtDay, fmtShort, fmtWeekdayShort, isoDate, mondayOf, moscowToday, parseIsoDate, plural } from "@/lib/utils";
import { OfflineCache } from "./offline-cache";

export const metadata = { title: "Расписание" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const today = moscowToday();
  const selected = parseIsoDate(sp.date) ?? today;
  const view = sp.view === "week" ? "week" : "day";
  const weekStart = mondayOf(selected);
  const lessons = await getLessons(student, weekStart, addDays(weekStart, 7));
  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const changes = lessons.filter((l) => l.status !== "SCHEDULED");
  const byDay = (d: Date) => lessons.filter((l) => l.date.getTime() === d.getTime());
  const href = (d: Date, v = view) => `/schedule?date=${isoDate(d)}${v === "week" ? "&view=week" : ""}`;

  const weekLabel = `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 5))}`;

  return (
    <div className="w-full">
      <PageHeader
        title="Расписание"
        subtitle={weekLabel}
        action={
          <a href="/api/schedule/ics" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2" download>
            <CalendarPlus size={17} /> <span className="hidden sm:inline">В календарь</span>
          </a>
        }
      />

      {/* Переключатель вида */}
      <div className="mb-3 grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold" role="tablist">
        {(["day", "week"] as const).map((v) => (
          <Link key={v} href={href(selected, v)} role="tab" aria-selected={view === v} className={cn("rounded-lg py-2 text-center transition", view === v ? "bg-surface shadow-sm" : "text-muted")}>
            {v === "day" ? "День" : "Неделя"}
          </Link>
        ))}
      </div>

      {/* Навигация по неделе */}
      <div className="mb-4 flex items-center gap-1">
        <Link href={href(addDays(weekStart, -7))} className="flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2" aria-label="Предыдущая неделя">
          <ChevronLeft size={20} />
        </Link>
        <div className="grid flex-1 grid-cols-6 gap-1">
          {days.map((d) => {
            const isSel = d.getTime() === selected.getTime();
            const isToday = d.getTime() === today.getTime();
            const hasChange = byDay(d).some((l) => l.status !== "SCHEDULED");
            const count = byDay(d).filter((l) => l.status !== "CANCELLED").length;
            return (
              <Link key={d.toISOString()} href={href(d, "day")} className={cn("relative flex flex-col items-center rounded-xl py-1.5 transition", isSel && view === "day" ? "bg-primary text-primary-fg" : "hover:bg-surface-2")} aria-label={fmtDay(d)}>
                <span className={cn("text-[11px] font-semibold uppercase", isSel && view === "day" ? "opacity-90" : "text-muted")}>{fmtWeekdayShort(d)}</span>
                <span className={cn("text-[17px] font-extrabold", isToday && !(isSel && view === "day") && "text-primary")}>{d.getUTCDate()}</span>
                <span className="flex h-1.5 gap-0.5">
                  {hasChange ? <span className="size-1.5 rounded-full bg-warning" /> : count > 0 ? <span className={cn("size-1.5 rounded-full", isSel && view === "day" ? "bg-primary-fg/70" : "bg-border")} /> : null}
                </span>
              </Link>
            );
          })}
        </div>
        <Link href={href(addDays(weekStart, 7))} className="flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2" aria-label="Следующая неделя">
          <ChevronRight size={20} />
        </Link>
      </div>

      {changes.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-warning-soft p-3 text-sm text-warning">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p>
            <b>
              {changes.length} {plural(changes.length, "изменение", "изменения", "изменений")} на этой неделе.
            </b>{" "}
            Переносы и отмены отмечены цветом.
          </p>
        </div>
      )}

      {view === "day" ? (
        <section aria-label={fmtDay(selected)}>
          <h2 className="mb-2 text-[15px] font-bold">
            {fmtDay(selected)}
            {selected.getTime() === today.getTime() && <span className="ml-2 font-medium text-primary">сегодня</span>}
          </h2>
          {byDay(selected).length ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{byDay(selected).map((l) => <LessonItem key={l.id} lesson={l} />)}</div>
          ) : (
            <EmptyState icon={<PartyPopper size={22} />} title="Пар нет" text="В этот день занятий не запланировано." />
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2 2xl:grid-cols-3">
          {days.map((d) => (
            <section key={d.toISOString()} aria-label={fmtDay(d)}>
              <h2 className={cn("mb-2 text-[15px] font-bold", d.getTime() === today.getTime() && "text-primary")}>
                {fmtDay(d)} {d.getTime() === today.getTime() && "· сегодня"}
              </h2>
              {byDay(d).length ? (
                <div className="space-y-2">{byDay(d).map((l) => <LessonItem key={l.id} lesson={l} />)}</div>
              ) : (
                <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">Пар нет</p>
              )}
            </section>
          ))}
        </div>
      )}

      <OfflineCache
        data={{
          savedAt: new Date().toISOString(),
          week: weekLabel,
          lessons: lessons.map((l) => ({ date: isoDate(l.date), start: l.startTime, end: l.endTime, course: l.course.name, room: l.room, status: l.status })),
        }}
      />
    </div>
  );
}
