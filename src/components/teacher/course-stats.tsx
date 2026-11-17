import { cn } from "@/lib/utils";

type Stats = {
  avgRatio: number | null;
  distribution: Record<string, number>;
  below: number;
  attendance: number | null;
  homework: { assignments: number; onTime: number; late: number; missing: number; pastDue: number };
  rows: unknown[];
};

const ORDER = ["5", "4", "3", "2", "зачёт", "незачёт"] as const;
const LABEL: Record<string, string> = { "5": "на 5", "4": "на 4", "3": "на 3", "2": "ниже 3", зачёт: "зачёт", незачёт: "незачёт" };

/** Статистика группы по дисциплине — над журналом преподавателя. Цвет только у проблем. */
export function CourseStatsPanel({ stats }: { stats: Stats }) {
  const dist = ORDER.filter((k) => stats.distribution[k]);
  const total = dist.reduce((a, k) => a + stats.distribution[k], 0);
  return (
    <section className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-border/70 bg-surface p-4">
        <div className="text-xs text-muted">Средний результат группы</div>
        <div className="mt-1 font-head text-2xl font-semibold tabular-nums">{stats.avgRatio != null ? `${Math.round(stats.avgRatio * 100)}%` : "—"}</div>
        <div className={cn("text-xs", stats.below ? "font-semibold text-danger" : "text-muted")}>{stats.below ? `ниже порога: ${stats.below}` : "все выше порога"}</div>
      </div>
      <div className="rounded-2xl border border-border/70 bg-surface p-4">
        <div className="text-xs text-muted">Прогноз оценок</div>
        {total ? (
          <>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              {dist.map((k) => (
                <div key={k} className={cn("h-full", k === "2" || k === "незачёт" ? "bg-danger" : k === "3" ? "bg-warning" : k === "4" ? "bg-primary" : "bg-success")} style={{ width: `${(stats.distribution[k] / total) * 100}%` }} title={`${LABEL[k]}: ${stats.distribution[k]}`} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-muted">
              {dist.map((k) => (
                <span key={k} className={cn((k === "2" || k === "незачёт") && "font-semibold text-danger")}>
                  {LABEL[k]} — {stats.distribution[k]}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-muted">оценок пока нет</div>
        )}
      </div>
      <div className="rounded-2xl border border-border/70 bg-surface p-4">
        <div className="text-xs text-muted">Посещаемость</div>
        <div className={cn("mt-1 font-head text-2xl font-semibold tabular-nums", stats.attendance != null && stats.attendance < 80 && "text-danger")}>{stats.attendance != null ? `${stats.attendance}%` : "—"}</div>
        <div className="text-xs text-muted">в среднем по группе</div>
      </div>
      <div className="rounded-2xl border border-border/70 bg-surface p-4">
        <div className="text-xs text-muted">Домашние задания</div>
        {stats.homework.assignments ? (
          <>
            <div className="mt-1 text-sm">
              вовремя <b className="tabular-nums">{stats.homework.onTime}</b> · с опозданием <b className="tabular-nums">{stats.homework.late}</b>
            </div>
            <div className={cn("text-sm", stats.homework.missing ? "font-semibold text-danger" : "text-muted")}>не сдали в срок: {stats.homework.missing}</div>
          </>
        ) : (
          <div className="mt-1 text-sm text-muted">заданий не было</div>
        )}
      </div>
    </section>
  );
}
