import type { LessonWithRefs } from "@/server/repos/student";
import { lessonKindLabel } from "@/lib/labels";
import { cn, fmtShort } from "@/lib/utils";

export function changeInfo(l: LessonWithRefs) {
  if (l.status === "CANCELLED") return { cancelled: true, label: "Отменено" };
  if (l.status === "MOVED") {
    const sameSlot = l.movedFromDate && l.movedFromDate.getTime() === l.date.getTime() && l.movedFromTime === l.startTime;
    return { cancelled: false, label: sameSlot ? "Новая аудитория" : `Перенос с ${l.movedFromDate ? fmtShort(l.movedFromDate) : ""} ${l.movedFromTime ?? ""}`.trim() };
  }
  return null;
}

/**
 * Пара в расписании. Иерархия: время → предмет → где → (мелко) вид и преподаватель.
 * Изменение показывается одной пометкой, без лишних цветов.
 */
export function LessonItem({ lesson: l, highlight }: { lesson: LessonWithRefs; highlight?: "now" | "next" }) {
  const change = changeInfo(l);
  const cancelled = change?.cancelled;
  return (
    <div className="flex gap-3 sm:gap-5">
      <div className={cn("w-14 shrink-0 pt-4 text-right tabular-nums sm:w-16", cancelled && "opacity-40")}>
        <div className="text-lg font-semibold leading-none">{l.startTime}</div>
        <div className="mt-1 text-[13px] text-muted">{l.endTime}</div>
      </div>
      <div className={cn("min-w-0 flex-1 rounded-[24px] border bg-surface p-4 sm:p-5", highlight === "now" ? "border-ink" : "border-border/70", cancelled && "bg-surface/60")}>
        <div className="flex items-start justify-between gap-3">
          <div className={cn("min-w-0 text-[17px] font-semibold leading-snug", cancelled && "text-muted line-through")}>{l.course.name}</div>
          {highlight === "now" && <span className="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-ink-fg">Идёт</span>}
          {change && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", cancelled ? "bg-danger-soft text-danger" : "bg-p-yellow text-[#0e0e10]")}>{change.label}</span>}
        </div>
        <div className={cn("mt-1 text-[15px]", cancelled && "text-muted")}>
          {l.room} · {l.building}
        </div>
        <div className="mt-0.5 text-[13px] text-muted">
          {lessonKindLabel[l.kind]}
          {l.subgroup ? ` · подгр. ${l.subgroup}` : ""} · {l.teacher.fullName}
        </div>
        {change && l.changeNote && change.label !== "Новая аудитория" && <p className="mt-2 text-[13px] text-muted">{l.changeNote}</p>}
      </div>
    </div>
  );
}
