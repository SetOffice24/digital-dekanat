import Link from "next/link";
import { ArrowLeft, UserCheck } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { attendanceHistory } from "@/server/repos/attendance";
import { EmptyState, PageHeader } from "@/components/ui";
import { lessonKindLabel } from "@/lib/labels";
import { cn, fmtDay, plural } from "@/lib/utils";

export const metadata = { title: "Посещаемость" };

const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });

/** История посещаемости студента: итог, по дисциплинам и все пары по датам (можно оставить только пропуски). */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ only?: string }> }) {
  const { student } = await requireStudent();
  const onlyAbsent = (await searchParams).only === "absent";
  const data = await attendanceHistory(student);
  const absent = data.total - data.present;
  const list = onlyAbsent ? data.history.filter((h) => !h.present) : data.history;

  // группировка по дням
  const days: { key: string; date: Date; items: typeof list }[] = [];
  for (const h of list) {
    const key = h.date.toISOString().slice(0, 10);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(h);
    else days.push({ key, date: h.date, items: [h] });
  }
  let lastMonth = "";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/grades" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Учёба
      </Link>
      <PageHeader
        title="Посещаемость"
        subtitle={data.total ? `${data.percent}% · пропущено ${absent} ${plural(absent, "пара", "пары", "пар")} из ${data.total}` : "Отметок пока нет"}
      />
      {data.total === 0 ? (
        <EmptyState icon={<UserCheck size={22} />} title="Отметок пока нет" text="Посещаемость появится, когда преподаватель отметит первую пару." />
      ) : (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-[15px] font-bold">По дисциплинам</h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
              {data.courses.map((c) => (
                <li key={c.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", (c.percent ?? 100) < 80 && "text-danger")}>{c.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={cn("h-full rounded-full", (c.percent ?? 100) < 80 ? "bg-danger" : "bg-success")} style={{ width: `${c.percent ?? 0}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    был на {c.present} из {c.total}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Ниже 80% — риск не получить допуск к экзамену или зачёту.</p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold">История</h2>
              <div className="flex gap-1.5">
                <Link href="/attendance" className={cn("rounded-full border px-3 py-1 text-sm font-medium", !onlyAbsent ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface")}>
                  Все пары
                </Link>
                <Link href="/attendance?only=absent" className={cn("rounded-full border px-3 py-1 text-sm font-medium", onlyAbsent ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface")}>
                  Пропуски
                </Link>
              </div>
            </div>
            {list.length === 0 ? (
              <p className="rounded-[28px] border border-border/70 bg-surface px-5 py-4 text-sm text-muted">Пропусков нет — так держать!</p>
            ) : (
              <div className="space-y-4">
                {days.map((d) => {
                  const month = monthFmt.format(d.date).replace(" г.", "");
                  const showMonth = month !== lastMonth;
                  lastMonth = month;
                  return (
                    <div key={d.key}>
                      {showMonth && <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{month}</div>}
                      <div className="mb-1.5 text-sm font-semibold">{fmtDay(d.date)}</div>
                      <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
                        {d.items.map((h) => (
                          <li key={h.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                            <span className="w-12 shrink-0 text-sm tabular-nums text-muted">{h.startTime}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{h.course.name}</span>
                              <span className="block text-xs text-muted">
                                {lessonKindLabel[h.kind]}
                                {h.cover && (
                                  <>
                                    {" · "}
                                    <Link href={`/requests/${h.cover.id}`} className="font-medium text-fg underline underline-offset-2">
                                      {h.cover.approved ? `уважительная (заявление № ${h.cover.number})` : `заявление № ${h.cover.number} на рассмотрении`}
                                    </Link>
                                  </>
                                )}
                              </span>
                            </span>
                            <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", h.present ? "bg-success-soft text-success" : h.cover?.approved ? "bg-surface-2 text-muted" : "bg-danger-soft text-danger")}>{h.present ? "Был" : "Пропуск"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            {!onlyAbsent && absent > 0 && (
              <p className="mt-4 text-sm text-muted">
                Пропуск по уважительной причине?{" "}
                <Link href="/requests/new?type=APP_ABSENCE" className="font-medium text-fg underline underline-offset-2">
                  Подать заявление
                </Link>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
