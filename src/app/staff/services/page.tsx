import Link from "next/link";
import { requireStaff } from "@/server/auth";
import { appointmentStats, autoIssued, lowRatings, servicesOverview, situationStats } from "@/server/services/analytics";
import { Card, SectionTitle } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { RevokeButton, ServiceRow } from "./parts";

export const metadata = { title: "Услуги — сводка" };

const Kpi = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" | "good" }) => (
  <div className="rounded-[24px] border border-border/70 bg-surface p-4">
    <div className="text-[13px] font-medium text-muted">{label}</div>
    <div className={cn("mt-1 font-head text-3xl font-semibold tabular-nums", tone === "bad" && "text-danger", tone === "good" && "text-success")}>{value}</div>
    {hint && <div className="mt-0.5 text-[13px] text-muted">{hint}</div>}
  </div>
);

/**
 * Сводка единого окна для руководства: укладывается ли деканат в срок, как оценивают студенты,
 * сколько сэкономила автовыдача, где копятся просрочки. Здесь же — настройки услуг (срок, автовыдача, доступность).
 */
export default async function ServicesOverview() {
  const { user, staff } = await requireStaff();
  const s = { id: staff.id, userId: user.id, facultyId: staff.facultyId };
  const [o, low, auto, sits, appts] = await Promise.all([servicesOverview(s), lowRatings(s), autoIssued(s), situationStats(s), appointmentStats(s)]);
  const t = o.totals;
  const canEdit = !staff.facultyId;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label={`Заявок за ${o.days} дн.`} value={String(t.total)} hint={`в работе ${t.open}`} />
        <Kpi label="Выполнено в срок" value={t.onTimePct != null ? `${t.onTimePct} %` : "—"} hint={t.avgDays != null ? `в среднем ${t.avgDays} дн.` : undefined} tone={t.onTimePct != null && t.onTimePct < 80 ? "bad" : "good"} />
        <Kpi label="Просрочено сейчас" value={String(t.overdueNow)} hint="ушли руководителю" tone={t.overdueNow ? "bad" : undefined} />
        <Kpi label="Оценка студентов" value={t.rating != null ? `${t.rating} / 5` : "—"} hint={t.ratedCount ? `${t.ratedCount} оценок` : "оценок пока нет"} />
        <Kpi label="Выдано автоматически" value={String(t.auto)} hint={`≈ ${t.savedHours} ч работы сотрудников`} tone={t.auto > 0 ? "good" : undefined} />
      </div>

      <SectionTitle>Услуги деканата</SectionTitle>
      {!canEdit && <p className="-mt-1 mb-3 text-[13px] text-muted">Срок, автовыдачу и доступность услуг меняет деканат уровня вуза.</p>}
      {/* одна структура для всех категорий: показатели — для просмотра, настройка — по кнопке в строке */}
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border/60">
          {[...new Set(o.byType.map((x) => x.category))].map((cat) => (
            <li key={cat}>
              <div className="bg-surface-2/60 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted sm:px-5">{cat}</div>
              <ul className="divide-y divide-border/60">
                {o.byType
                  .filter((x) => x.category === cat)
                  .map((r) => (
                    <ServiceRow key={r.id} r={r} canEdit={canEdit} />
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-2 grid gap-x-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Что не понравилось студентам</SectionTitle>
          {low.length ? (
            <ul className="space-y-2">
              {low.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border/70 bg-surface p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-[#d08a00]">{"★".repeat(r.rating ?? 0)}</span>
                    <span className="font-medium">{r.type.title}</span>
                    <span className="text-muted">· №{r.number}</span>
                  </div>
                  {r.ratingComment && <p className="mt-1">«{r.ratingComment}»</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Низких оценок нет.</p>
          )}

          <SectionTitle>Жизненные ситуации за 30 дней</SectionTitle>
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-surface text-sm">
            {sits.map((x) => (
              <li key={x.code} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1">{x.title}</span>
                <span className="tabular-nums text-muted">начали {x.started}</span>
                <span className="tabular-nums text-success">завершили {x.done}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle action={<Link href="/staff/services/appointments" className="text-[13px] font-semibold text-muted hover:text-fg">Приём →</Link>}>Приём в деканате</SectionTitle>
          <p className="text-sm">
            Сегодня записано: <b>{appts.today}</b>. Неявки за месяц: <b>{appts.noShowPct != null ? `${appts.noShowPct} %` : "нет данных"}</b>
            {appts.held ? ` из ${appts.held} приёмов` : ""}.
          </p>

          <SectionTitle>Автовыдача справок</SectionTitle>
          <p className="-mt-1 mb-2 text-[13px] text-muted">Справки об обучении выдаются сразу после заказа. Если в данных ошибка — отзовите: QR перестанет подтверждать справку, студент получит уведомление.</p>
          {auto.length ? (
            <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-surface text-sm">
              {auto.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Link href={`/staff/requests/${r.id}`} className="min-w-0 flex-1 hover:underline">
                    №{r.number} · {r.student.lastName} {r.student.firstName} ({r.student.group.name}) · {fmtDate(r.createdAt)}
                  </Link>
                  {r.certificate?.revoked ? <span className="text-[13px] font-semibold text-danger">отозвана</span> : <RevokeButton requestId={r.id} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Пока ничего не выдано автоматически.</p>
          )}
        </div>
      </div>
    </>
  );
}
