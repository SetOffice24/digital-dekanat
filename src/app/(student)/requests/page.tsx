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
    <Link href={`/requests/${r.id}`} className="group flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-primary/40">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">
        <FileText size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{r.type.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <StatusBadge status={r.status} />
          <span>№ {r.number} · {fmtDate(r.createdAt)}</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Заявки и справки" subtitle="Справки и заявления — без очереди в деканате" />
      <ButtonLink href="/requests/new" className="mb-8 w-full sm:w-auto">
        <FilePlus2 size={18} /> Новая заявка
      </ButtonLink>
      {requests.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Заявок пока нет" text="Закажите справку или подайте заявление — это займёт минуту." action={<ButtonLink href="/requests/new">Создать заявку</ButtonLink>} />
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 className="mb-2 text-[15px] font-bold">Активные</h2>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{active.map((r) => <Row key={r.id} r={r} />)}</div>
            </>
          )}
          {archive.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-[15px] font-bold">Завершённые</h2>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{archive.map((r) => <Row key={r.id} r={r} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
