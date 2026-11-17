import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups } from "@/server/repos/staff";
import { groupAttendance } from "@/server/repos/attendance";
import { PageHeader } from "@/components/ui";
import { cn, fmtShort } from "@/lib/utils";
import { GroupSelect } from "@/components/staff/group-select";
import { StudentsTabs } from "@/components/staff/students-tabs";

export const metadata = { title: "Посещаемость" };

/** Деканат: посещаемость группы — кто пропускает больше всех (сверху), последние пропуски по нажатию. */
export default async function StaffAttendance({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const groups = await listGroups(staff);
  const group = groups.find((g) => g.id === sp.group) ?? groups.find((g) => g.name === "ИВТ-24-1") ?? groups[0];
  const data = group ? await groupAttendance(staff, group.id) : null;
  const risk = data?.rows.filter((r) => r.percent != null && r.percent < 80).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <StudentsTabs active="attendance" groupId={group?.id} />
      <PageHeader
        title="Посещаемость"
        subtitle={data ? (data.percent != null ? `${data.group.name}: в среднем ${data.percent}%${risk ? `, ниже 80% — ${risk} ${risk === 1 ? "студент" : risk < 5 ? "студента" : "студентов"}` : ""}.` : `${data.group.name}: отметок пока нет.`) : undefined}
      />
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <GroupSelect groups={groups.map((g) => ({ id: g.id, name: g.name }))} value={group?.id} path="/staff/attendance" />
        <Link href={`/staff/schedule?group=${group?.id ?? ""}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-ink">
          <CalendarDays size={16} /> Отметить пару — в расписании
        </Link>
      </div>

      {data && (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {data.rows.map((r) => (
            <li key={r.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <Link href={`/staff/students/${r.id}`} className="block truncate font-medium hover:underline">{r.name}</Link>
                    <span className="block text-xs text-muted tabular-nums">{r.total ? `пропусков ${r.absent} из ${r.total}` : "нет отметок"}</span>
                  </span>
                  <span className={cn("w-12 shrink-0 text-right font-semibold tabular-nums", r.percent != null && r.percent < 80 && "text-danger")}>{r.percent != null ? `${r.percent}%` : ""}</span>
                </summary>
                {r.recent.length > 0 && (
                  <ul className="space-y-0.5 border-t border-border/60 px-4 pb-3 pt-2 text-sm text-muted sm:px-5">
                    <li className="text-xs font-semibold">Последние пропуски:</li>
                    {r.recent.map((l, i) => (
                      <li key={i}>
                        {fmtShort(l.date)}, {l.startTime} — {l.course.name}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
