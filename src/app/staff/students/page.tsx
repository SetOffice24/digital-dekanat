import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups } from "@/server/repos/staff";
import { applyFilter, groupGradebook, type GradebookFilter } from "@/server/repos/analytics";
import { PageHeader } from "@/components/ui";
import { GroupSelect } from "@/components/staff/group-select";
import { StudentsTabs } from "@/components/staff/students-tabs";
import { forecastLabel, isBelow } from "@/lib/grading";
import { cn, plural } from "@/lib/utils";

export const metadata = { title: "Ведомость" };

const FILTERS: { key: GradebookFilter; label: string }[] = [
  { key: "debts", label: "С долгами" },
  { key: "low", label: "Баллы ниже 60 %" },
  { key: "attendance", label: "Посещаемость ниже 80 %" },
  { key: "homework", label: "Есть несданные ДЗ" },
];
/** Режимы чтения таблицы: успеваемость (дисциплины), риски (посещаемость, ДЗ, ниже порога) или всё вместе. */
const VIEWS = { grades: "Успеваемость", risks: "Риски", all: "Всё" } as const;
type View = keyof typeof VIEWS;
const SORTS = { name: "по фамилии", avg: "по среднему баллу", attendance: "по посещаемости", homework: "по сданным ДЗ" } as const;
type Sort = keyof typeof SORTS;

const fmtAvg = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));
const GRADE: Record<string, string> = { "5": "5", "4": "4", "3": "3", "2": "2", PASS: "зач.", FAIL: "незач." };

/**
 * Сводная ведомость группы: студенты × дисциплины семестра.
 * Цвет — только у проблем (прогноз ниже «3», долг, посещаемость < 80 %), остальное — спокойными цифрами.
 */
export default async function GradebookPage({ searchParams }: { searchParams: Promise<{ group?: string; sem?: string; f?: string; sort?: string; view?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const groups = await listGroups(staff);
  const group = groups.find((g) => g.id === sp.group) ?? groups.find((g) => g.name === "ИВТ-24-1") ?? groups[0];
  if (!group) notFound();
  const gb = await groupGradebook(staff, group.id, Number(sp.sem) || undefined);
  if (!gb) notFound();
  const filter = FILTERS.some((x) => x.key === sp.f) ? (sp.f as GradebookFilter) : undefined;
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "name";
  const rows = applyFilter(gb.rows, filter).sort((a, b) =>
    sort === "avg" ? (a.avg ?? 99) - (b.avg ?? 99) : sort === "attendance" ? (a.attendance ?? 101) - (b.attendance ?? 101) : sort === "homework" ? (a.homework.percent ?? 101) - (b.homework.percent ?? 101) : 0,
  );
  const current = gb.semester === gb.curSem;
  // фильтр по посещаемости или ДЗ без явного режима — показываем и эти колонки
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : filter === "attendance" || filter === "homework" ? "all" : "grades";
  const showCourses = view !== "risks";
  const showRisks = view !== "grades";
  const lowOf = (r: (typeof rows)[number]) => gb.courses.filter((c) => {
    const cell = r.cells[c.id];
    return cell?.kind === "current" && cell.forecast && isBelow(cell.forecast);
  });
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const v = { group: group.id, sem: gb.semester !== gb.curSem ? String(gb.semester) : undefined, f: filter, sort: sort !== "name" ? sort : undefined, view: view !== "grades" ? view : undefined, ...p };
    for (const [k, x] of Object.entries(v)) if (x) q.set(k, x);
    return `/staff/students?${q}`;
  };
  const count = (k: GradebookFilter) => applyFilter(gb.rows, k).length;

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <StudentsTabs active="gradebook" groupId={group.id} />
      <PageHeader
        title="Ведомость"
        subtitle={`${gb.group.name} · ${gb.group.course} курс · ${gb.group.program.name} · ${gb.rows.length} ${plural(gb.rows.length, "студент", "студента", "студентов")}`}
        action={
          <a href={`/api/staff/gradebook?group=${group.id}&sem=${gb.semester}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-ink">
            <FileSpreadsheet size={17} /> Скачать Excel
          </a>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <GroupSelect groups={groups.map((g) => ({ id: g.id, name: g.name }))} value={group.id} path="/staff/students" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: gb.curSem }, (_, i) => gb.curSem - i).map((s) => (
            <Link key={s} href={href({ sem: s === gb.curSem ? undefined : String(s), f: undefined })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", s === gb.semester ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink")}>
              {s} сем{s === gb.curSem ? " · сейчас" : ""}
            </Link>
          ))}
        </div>
        <div className="hidden rounded-full bg-surface-2 p-1 md:ml-auto md:inline-flex" role="group" aria-label="Что показать в таблице">
          {(Object.keys(VIEWS) as View[]).map((k) => (
            <Link key={k} href={href({ view: k === "grades" ? undefined : k })} aria-current={view === k ? "true" : undefined} className={cn("inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition", view === k ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
              {VIEWS[k]}
            </Link>
          ))}
        </div>
      </div>
      {/* Телефон: фильтры и сортировка свёрнуты, чтобы список студентов был на первом экране */}
      <details className="group mb-4 md:hidden" open={Boolean(filter) || sort !== "name"}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-full border border-border bg-surface px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          Фильтры и сортировка{filter ? `: ${FILTERS.find((x) => x.key === filter)?.label}` : ""}
          <span className="text-muted group-open:hidden">показать</span>
          <span className="hidden text-muted group-open:inline">скрыть</span>
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Link href={href({ f: undefined })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", !filter ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface")}>
            Все
          </Link>
          {FILTERS.filter((x) => current || x.key === "debts" || x.key === "attendance").map((x) => (
            <Link key={x.key} href={href({ f: x.key })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", filter === x.key ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface")}>
              {x.label} <span className={filter === x.key ? "text-ink-fg/70" : "text-muted"}>{count(x.key)}</span>
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
          {(Object.keys(SORTS) as Sort[]).map((k) => (
            <Link key={k} href={href({ sort: k === "name" ? undefined : k })} className={cn("rounded-full px-3 py-1.5", sort === k ? "bg-surface-2 font-semibold" : "text-muted")}>
              {SORTS[k]}
            </Link>
          ))}
        </div>
      </details>

      <div className="mb-4 hidden flex-wrap items-center gap-1.5 md:flex">
        <Link href={href({ f: undefined })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", !filter ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink")}>
          Все
        </Link>
        {FILTERS.filter((x) => current || x.key === "debts" || x.key === "attendance").map((x) => (
          <Link key={x.key} href={href({ f: x.key })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", filter === x.key ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink")}>
            {x.label} <span className={filter === x.key ? "text-ink-fg/70" : "text-muted"}>{count(x.key)}</span>
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted">
          Сортировка:{" "}
          {(Object.keys(SORTS) as Sort[]).map((k, i) => (
            <span key={k}>
              {i > 0 && " · "}
              <Link href={href({ sort: k === "name" ? undefined : k })} className={cn("hover:text-fg", sort === k && "font-semibold text-fg underline underline-offset-2")}>
                {SORTS[k]}
              </Link>
            </span>
          ))}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[28px] border border-border/70 bg-surface px-5 py-6 text-center text-muted">По этому фильтру студентов нет.</p>
      ) : (
        <>
          {/* Компьютер: таблица; первая колонка закреплена, остальное прокручивается внутри карточки */}
          <div className="hidden max-h-[75vh] overflow-auto rounded-[28px] border border-border/70 bg-surface md:block">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface [&>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
                  <th className="left-0 !z-20 px-4 py-3 font-semibold">Студент</th>
                  {showCourses &&
                    gb.courses.map((c) => (
                      <th key={c.id} className="max-w-36 px-3 py-3 text-right font-semibold" title={c.name}>
                        <span className="line-clamp-2">{c.name}</span>
                      </th>
                    ))}
                  <th className="px-3 py-3 text-right font-semibold" title="Средний балл итоговых оценок прошлых семестров">
                    Ср. итог
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">Долги</th>
                  {showRisks && (
                    <>
                      <th className="px-3 py-3 text-right font-semibold">Посещ.</th>
                      <th className="px-3 py-3 text-right font-semibold">ДЗ</th>
                      {current && <th className="px-4 py-3 font-semibold">Ниже порога</th>}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group/row border-b border-border/50 last:border-0 hover:bg-surface-2/50">
                    <td className="sticky left-0 z-[5] bg-surface px-4 py-2.5 group-hover/row:bg-surface-2">
                      <Link href={`/staff/students/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    {showCourses && gb.courses.map((c) => {
                      const cell = r.cells[c.id];
                      if (!cell) return <td key={c.id} className="px-3 py-2.5 text-right text-muted">—</td>;
                      if (cell.kind === "final") {
                        const bad = cell.value === "2" || cell.value === "FAIL";
                        return (
                          <td key={c.id} className={cn("px-3 py-2.5 text-right tabular-nums", bad && "font-semibold text-danger")}>
                            {cell.value ? GRADE[cell.value] ?? cell.value : "—"}
                          </td>
                        );
                      }
                      if (!cell.forecast) return <td key={c.id} className="px-3 py-2.5 text-right text-xs text-muted">нет оценок</td>;
                      const bad = isBelow(cell.forecast);
                      return (
                        <td key={c.id} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                          <span className={cn("font-medium", bad && "text-danger")}>
                            {cell.points}/{cell.max}
                          </span>
                          {/* подпись прогноза фиксированной ширины — дроби в колонке стоят ровно */}
                          <span className={cn("ml-1.5 inline-block w-14 text-left text-xs", bad ? "font-semibold text-danger" : "text-muted")}>{forecastLabel(cell.forecast)}</span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtAvg(r.avg)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", r.debts > 0 && "font-semibold text-danger")}>{r.debts || "—"}</td>
                    {showRisks && (
                      <>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", r.attendance != null && r.attendance < 80 && "font-semibold text-danger")}>{r.attendance != null ? `${r.attendance}%` : "—"}</td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", r.homework.missing + r.homework.returned > 0 && "font-semibold text-warning")}>{r.homework.due ? `${r.homework.done}/${r.homework.due}` : "—"}</td>
                        {current && <td className={cn("max-w-64 px-4 py-2.5 text-[13px]", lowOf(r).length ? "text-danger" : "text-muted")}>{lowOf(r).map((c) => c.name).join(", ") || "—"}</td>}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Телефон: список студентов с главными цифрами */}
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface md:hidden">
            {rows.map((r) => {
              const lowCourses = lowOf(r);
              return (
                <li key={r.id}>
                  <Link href={`/staff/students/${r.id}`} className="block px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
                      <span>ср. {fmtAvg(r.avg)}</span>
                      {r.debts > 0 && <span className="font-semibold text-danger">долгов {r.debts}</span>}
                      <span className={cn(r.attendance != null && r.attendance < 80 && "font-semibold text-danger")}>посещ. {r.attendance != null ? `${r.attendance}%` : "—"}</span>
                      <span className={cn(r.homework.missing + r.homework.returned > 0 && "font-semibold text-warning")}>ДЗ {r.homework.due ? `${r.homework.done}/${r.homework.due}` : "—"}</span>
                    </div>
                    {lowCourses.length > 0 && <div className="mt-1 text-sm text-danger">Ниже порога: {lowCourses.map((c) => c.name).join(", ")}</div>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-muted">
        {current ? "Текущий семестр: баллы от возможного на сегодня и прогноз оценки (60 % — «3», 75 % — «4», 90 % — «5»)." : "Прошедший семестр: итоговые оценки."} «Ср. итог» — средний балл итоговых оценок прошлых семестров. «Успеваемость» — дисциплины, «Риски» — посещаемость, ДЗ и дисциплины ниже порога. ДЗ — сдано из тех, у которых прошёл срок или которые уже сданы.
      </p>
    </div>
  );
}
