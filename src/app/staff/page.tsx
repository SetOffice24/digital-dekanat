import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { getDashboard } from "@/server/repos/staff";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { RequestRow } from "@/components/staff/request-row";

export const metadata = { title: "Сводка" };

export default async function StaffHome() {
  const { staff } = await requireStaff();
  const d = await getDashboard(staff);
  const stats = [
    { label: "Новые заявки", value: d.newCount, href: "/staff/requests?status=NEW", cls: "text-info" },
    { label: "Нужно уточнение", value: d.needInfoCount, href: "/staff/requests?status=NEED_INFO", cls: "text-warning" },
    { label: "Просрочены по сроку", value: d.overdueCount, href: "/staff/requests", cls: "text-danger" },
  ];
  return (
    <>
      <PageHeader title="Сводка" subtitle={staff.fullName} />
      <div className="grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full p-3.5 transition hover:border-primary/50">
              <div className={`text-3xl font-extrabold ${s.cls}`}>{s.value}</div>
              <div className="mt-1 text-xs font-semibold leading-tight text-muted">{s.label}</div>
            </Card>
          </Link>
        ))}
      </div>
      <SectionTitle
        className="mt-6"
        action={
          <Link href="/staff/requests" className="text-sm font-semibold text-primary">
            Все заявки
          </Link>
        }
      >
        Последние заявки
      </SectionTitle>
      {d.recent.length ? (
        <div className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {d.recent.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Inbox size={22} />} title="Заявок пока нет" text="Когда студенты отправят заявки, они появятся здесь." />
      )}
    </>
  );
}
