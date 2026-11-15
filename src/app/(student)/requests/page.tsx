import Link from "next/link";
import { ChevronRight, FilePlus2, FileText } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { listRequests } from "@/server/repos/student";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Заявки" };

export default async function RequestsPage() {
  const { student } = await requireStudent();
  const requests = await listRequests(student);
  const active = requests.filter((r) => !["DONE", "REJECTED"].includes(r.status));
  const archive = requests.filter((r) => ["DONE", "REJECTED"].includes(r.status));

  const Row = ({ r }: { r: (typeof requests)[number] }) => (
    <Link href={`/requests/${r.id}`} className="group flex items-center gap-3 rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(20,24,40,0.04)] ring-1 ring-border/70 p-3.5 transition hover:border-primary/40">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
        <FileText size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{r.type.title}</span>
        <span className="block text-[13px] text-muted">
          № {r.number} · от {fmtDate(r.createdAt)}
        </span>
      </span>
      <StatusBadge status={r.status} />
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Заявки и справки"
        subtitle="Без очереди в деканате"
        action={
          <ButtonLink href="/requests/new" className="shrink-0">
            <FilePlus2 size={18} /> <span className="hidden sm:inline">Новая заявка</span>
          </ButtonLink>
        }
      />
      {requests.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Заявок пока нет" text="Закажите справку или подайте заявление — это займёт минуту." action={<ButtonLink href="/requests/new">Создать заявку</ButtonLink>} />
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 className="mb-2 text-[15px] font-bold">Активные</h2>
              <div className="space-y-2">{active.map((r) => <Row key={r.id} r={r} />)}</div>
            </>
          )}
          {archive.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-[15px] font-bold">Завершённые</h2>
              <div className="space-y-2">{archive.map((r) => <Row key={r.id} r={r} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
