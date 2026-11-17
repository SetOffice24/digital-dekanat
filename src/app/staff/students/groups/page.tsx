import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { groupsOverview } from "@/server/repos/analytics";
import { PageHeader } from "@/components/ui";
import { StudentsTabs } from "@/components/staff/students-tabs";
import { cn, plural } from "@/lib/utils";

export const metadata = { title: "Группы" };

const fmtAvg = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));

/** Статистика по группам в области доступа сотрудника: где проблемы — видно сразу, нажатие ведёт в ведомость. */
export default async function GroupsPage() {
  const { staff } = await requireStaff();
  const groups = await groupsOverview(staff);
  const students = groups.reduce((a, g) => a + g.students, 0);
  const attention = groups.reduce((a, g) => a + g.needAttention, 0);
  const debts = groups.reduce((a, g) => a + g.debts, 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <StudentsTabs active="groups" />
      <PageHeader
        title="Группы"
        subtitle={`${groups.length} ${plural(groups.length, "группа", "группы", "групп")} · ${students} ${plural(students, "студент", "студента", "студентов")} · долгов ${debts} · требуют внимания ${attention}`}
      />

      {/* Компьютер — таблица */}
      <div className="hidden overflow-hidden rounded-[28px] border border-border/70 bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs text-muted">
              <th className="px-5 py-3 font-semibold">Группа</th>
              <th className="px-3 py-3 text-right font-semibold">Студентов</th>
              <th className="px-3 py-3 text-right font-semibold">Средний балл</th>
              <th className="px-3 py-3 text-right font-semibold">Успевают</th>
              <th className="px-3 py-3 text-right font-semibold">Долгов</th>
              <th className="px-3 py-3 text-right font-semibold">Посещаемость</th>
              <th className="px-3 py-3 text-right font-semibold">ДЗ сдано</th>
              <th className="px-5 py-3 text-right font-semibold">Требуют внимания</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50">
                <td className="px-5 py-3">
                  <Link href={`/staff/students?group=${g.id}`} className="font-semibold hover:underline">
                    {g.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {g.program}, {g.course} курс
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{g.students}</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmtAvg(g.avg)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{g.successful != null ? `${g.successful}%` : "—"}</td>
                <td className={cn("px-3 py-3 text-right tabular-nums", g.debts > 0 && "font-semibold text-danger")}>{g.debts || "—"}</td>
                <td className={cn("px-3 py-3 text-right tabular-nums", g.attendance != null && g.attendance < 80 && "font-semibold text-danger")}>{g.attendance != null ? `${g.attendance}%` : "нет отметок"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{g.homework != null ? `${g.homework}%` : "—"}</td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/staff/students?group=${g.id}`} className={cn("inline-flex items-center gap-1 tabular-nums", g.needAttention ? "font-semibold" : "text-muted")}>
                    {g.needAttention || "—"} <ChevronRight size={15} className="text-muted" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Телефон — список */}
      <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface md:hidden">
        {groups.map((g) => (
          <li key={g.id}>
            <Link href={`/staff/students?group=${g.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {g.name} <span className="font-normal text-muted">· {g.students} чел.</span>
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                  <span>ср. {fmtAvg(g.avg)}</span>
                  {g.debts > 0 && <span className="font-semibold text-danger">долгов {g.debts}</span>}
                  <span>посещ. {g.attendance != null ? `${g.attendance}%` : "—"}</span>
                  <span>ДЗ {g.homework != null ? `${g.homework}%` : "—"}</span>
                </span>
                {g.needAttention > 0 && <span className="mt-0.5 block text-sm font-medium">Требуют внимания: {g.needAttention}</span>}
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">«Успевают» — без долгов и без прогноза ниже «3» в текущем семестре. «Требуют внимания» — есть долг, прогноз ниже «3», посещаемость ниже 80 % или несданные/возвращённые ДЗ.</p>
    </div>
  );
}
