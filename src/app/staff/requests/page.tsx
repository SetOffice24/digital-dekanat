import Link from "next/link";
import { Inbox } from "lucide-react";
import type { RequestStatus } from "@prisma/client";
import { requireStaff } from "@/server/auth";
import { listRequests, listTypes } from "@/server/repos/staff";
import { Button, EmptyState, PageHeader, Select } from "@/components/ui";
import { RequestRow } from "@/components/staff/request-row";
import { requestStatusLabel } from "@/lib/labels";

export const metadata = { title: "Заявки" };

const statuses = Object.keys(requestStatusLabel) as RequestStatus[];

export default async function StaffRequests({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const status = statuses.find((s) => s === sp.status);
  const types = await listTypes();
  const typeId = types.find((t) => t.id === sp.type)?.id;
  const rows = await listRequests(staff, { status, typeId });
  return (
    <>
      <PageHeader title="Заявки" subtitle={`Найдено: ${rows.length}`} />
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <Select name="status" defaultValue={status ?? ""} aria-label="Статус" className="sm:w-48">
          <option value="">Все статусы</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {requestStatusLabel[s]}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={typeId ?? ""} aria-label="Тип заявки" className="sm:w-64">
          <option value="">Все типы</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
        <Button type="submit">Применить</Button>
        <Link href="/staff/requests" className="flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-muted hover:text-fg">
          Сбросить
        </Link>
      </form>
      {rows.length ? (
        <div className="grid gap-2.5 md:grid-cols-2">
          {rows.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Inbox size={22} />} title="Ничего не найдено" text="Попробуйте изменить фильтры." />
      )}
    </>
  );
}
