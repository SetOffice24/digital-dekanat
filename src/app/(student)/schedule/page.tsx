import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getLessons } from "@/server/repos/student";
import { LessonItem } from "@/components/lesson-item";
import { addDays, cn, fmtDay, fmtShort, fmtWeekdayShort, isoDate, minutesOf, mondayOf, moscowTime, moscowToday, parseIsoDate, plural } from "@/lib/utils";
import { OfflineCache } from "./offline-cache";

export const metadata = { title: "Расписание" };

/**
 * Простое расписание: один выбор дня (с числом пар под датой) и список пар этого дня.
 * По умолчанию — сегодня, а если сегодня воскресенье — понедельник.
 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const today = moscowToday();
  let selected = parseIsoDate(sp.date) ?? today;
  if (!sp.date && selected.getUTCDay() === 0) selected = addDays(selected, 1);
  const weekStart = mondayOf(selected);
  const lessons = await getLessons(student, weekStart, addDays(weekStart, 7));
  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const byDay = (d: Date) => lessons.filter((l) => l.date.getTime() === d.getTime());
  const changes = lessons.filter((l) => l.status !== "SCHEDULED").length;
  const dayLessons = byDay(selected);
  const nowMin = minutesOf(moscowTime());
  const isToday = selected.getTime() === today.getTime();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">Расписание</h1>
          <p className="mt-2 text-[15px] text-muted sm:text-lg">
            {fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 5))}
            {changes > 0 && (
              <>
                {" "}· <span className="font-medium text-fg">{changes} {plural(changes, "изменение", "изменения", "изменений")}</span>
              </>
            )}
          </p>
        </div>
        <a href="/api/schedule/ics" download className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted hover:bg-surface hover:text-fg" title="Скачать расписание для календаря телефона">
          <CalendarPlus size={18} /> <span className="hidden sm:inline">В календарь</span>
        </a>
      </div>

      {/* Выбор дня */}
      <div className="mb-8 flex items-center gap-1.5 sm:gap-2">
        <Link href={`/schedule?date=${isoDate(addDays(weekStart, -7))}`} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface" aria-label="Предыдущая неделя">
          <ChevronLeft size={20} />
        </Link>
        <div className="grid flex-1 grid-cols-6 gap-1.5 sm:gap-2">
          {days.map((d) => {
            const sel = d.getTime() === selected.getTime();
            const items = byDay(d);
            const count = items.filter((l) => l.status !== "CANCELLED").length;
            const changed = items.some((l) => l.status !== "SCHEDULED");
            const todayMark = d.getTime() === today.getTime();
            return (
              <Link key={d.toISOString()} href={`/schedule?date=${isoDate(d)}`} aria-current={sel ? "date" : undefined} aria-label={`${fmtDay(d)}: ${count ? `${count} ${plural(count, "пара", "пары", "пар")}` : "пар нет"}`} className={cn("relative flex flex-col items-center rounded-[20px] py-2.5 transition sm:py-3", sel ? "bg-ink text-ink-fg" : "bg-surface hover:bg-surface-2")}>
                <span className={cn("text-[11px] font-medium uppercase", sel ? "opacity-70" : "text-muted")}>{fmtWeekdayShort(d)}</span>
                <span className="text-lg font-semibold leading-tight sm:text-xl">{d.getUTCDate()}</span>
                <span className={cn("mt-0.5 hidden text-[11px] sm:block", sel ? "opacity-70" : "text-muted")}>{count ? `${count} ${plural(count, "пара", "пары", "пар")}` : "—"}</span>
                <span className={cn("mt-0.5 text-[11px] sm:hidden", sel ? "opacity-70" : "text-muted")}>{count || "—"}</span>
                {changed && <span className="absolute right-2 top-2 size-2 rounded-full bg-[#f2b705]" aria-hidden />}
                {todayMark && !sel && <span className="absolute bottom-1 size-1 rounded-full bg-ink" aria-hidden />}
              </Link>
            );
          })}
        </div>
        <Link href={`/schedule?date=${isoDate(addDays(weekStart, 7))}`} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface" aria-label="Следующая неделя">
          <ChevronRight size={20} />
        </Link>
      </div>

      <h2 className="mb-4 font-head text-xl font-semibold sm:text-2xl">
        {fmtDay(selected)}
        {isToday && <span className="ml-2 text-base font-medium text-muted">сегодня</span>}
      </h2>

      {dayLessons.length ? (
        <div className="space-y-3">
          {dayLessons.map((l) => (
            <LessonItem key={l.id} lesson={l} highlight={isToday && l.status !== "CANCELLED" && minutesOf(l.startTime) <= nowMin && nowMin < minutesOf(l.endTime) ? "now" : undefined} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-[28px] border border-border/70 bg-surface p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-p-mint text-[#0e0e10]">
            <PartyPopper size={22} />
          </span>
          <div>
            <div className="font-semibold">Пар нет</div>
            <div className="text-sm text-muted">В этот день занятий не запланировано.</div>
          </div>
        </div>
      )}

      <OfflineCache
        data={{
          savedAt: new Date().toISOString(),
          week: `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 5))}`,
          lessons: lessons.map((l) => ({ date: isoDate(l.date), start: l.startTime, end: l.endTime, course: l.course.name, room: l.room, status: l.status })),
        }}
      />
    </div>
  );
}
