import { MapPin, User } from "lucide-react";
import type { LessonWithRefs } from "@/server/repos/student";
import { lessonKindLabel } from "@/lib/labels";
import { cn, fmtShort } from "@/lib/utils";
import { Badge } from "./ui";

export function changeInfo(l: LessonWithRefs) {
  if (l.status === "CANCELLED") return { tone: "danger" as const, label: "Отменено" };
  if (l.status === "MOVED") {
    const sameSlot = l.movedFromDate && l.movedFromDate.getTime() === l.date.getTime() && l.movedFromTime === l.startTime;
    if (sameSlot) return { tone: "warning" as const, label: "Новая аудитория" };
    return { tone: "warning" as const, label: `Перенесено с ${l.movedFromDate ? fmtShort(l.movedFromDate) : ""} ${l.movedFromTime ?? ""}`.trim() };
  }
  return null;
}

export function LessonItem({ lesson: l, highlight }: { lesson: LessonWithRefs; highlight?: "now" | "next" }) {
  const change = changeInfo(l);
  const cancelled = l.status === "CANCELLED";
  return (
    <div
      className={cn(
        "flex gap-3 rounded-[24px] border bg-surface p-4",
        change ? (cancelled ? "border-danger/30" : "border-warning/50") : "border-border/70",
        highlight === "now" && "border-ink ring-1 ring-ink",
      )}
    >
      <div className={cn("w-12 shrink-0 text-right tabular-nums", cancelled && "opacity-50")}>
        <div className="text-[15px] font-bold leading-tight">{l.startTime}</div>
        <div className="text-xs text-muted">{l.endTime}</div>
      </div>
      <div className={cn("w-1 shrink-0 rounded-full", cancelled ? "bg-danger/40" : change ? "bg-warning" : l.kind === "LECTURE" ? "bg-primary" : l.kind === "LAB" ? "bg-info" : "bg-success")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted">{lessonKindLabel[l.kind]}</span>
          {l.subgroup && <span className="text-xs text-muted">· подгр. {l.subgroup}</span>}
          {highlight === "now" && <Badge tone="primary">Идёт сейчас</Badge>}
          {change && <Badge tone={change.tone}>{change.label}</Badge>}
        </div>
        <div className={cn("mt-0.5 font-bold leading-snug", cancelled && "text-muted line-through")}>{l.course.name}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin size={13} /> {l.room}, {l.building}
          </span>
          <span className="inline-flex items-center gap-1">
            <User size={13} /> {l.teacher.fullName}
          </span>
        </div>
        {change && l.changeNote && <p className={cn("mt-1.5 text-[13px]", cancelled ? "text-danger" : "text-warning")}>{l.changeNote}</p>}
      </div>
    </div>
  );
}
