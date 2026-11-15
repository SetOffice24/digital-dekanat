import Link from "next/link";
import { ChevronRight, Download, FilePlus2, FileText, GraduationCap, MessageCircleQuestion, ShieldCheck, Wallet } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { listRequests } from "@/server/repos/student";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { dueDate, fmtDate, fmtShort } from "@/lib/utils";

export const metadata = { title: "Заявки" };

/** Самое частое — в один клик: сразу открывается нужная форма. */
const QUICK = [
  { code: "CERT_STUDY", title: "Справка об обучении", text: "PDF с QR · за 1 день", icon: GraduationCap, tone: "bg-p-mint" },
  { code: "CERT_SCHOLARSHIP", title: "Справка о стипендии", text: "PDF · за 2 дня", icon: Wallet, tone: "bg-p-mint" },
  { code: "CERT_MILITARY", title: "Для военкомата", text: "С печатью · за 3 дня", icon: ShieldCheck, tone: "bg-p-mint" },
] as const;

export default async function RequestsPage() {
  const { student } = await requireStudent();
  const requests = await listRequests(student);
  // что ждёт действия от самого студента — наверх, отдельно от остального
  const needAnswer = requests.filter((r) => r.status === "NEED_INFO");
  const ready = requests.filter((r) => r.status === "READY");
  const inProgress = requests.filter((r) => r.status === "NEW" || r.status === "IN_REVIEW");
  const archive = requests.filter((r) => ["DONE", "REJECTED"].includes(r.status));

  const Row = ({ r }: { r: (typeof requests)[number] }) => {
    const next =
      r.status === "NEW" || r.status === "IN_REVIEW"
        ? `Будет готово до ${fmtShort(dueDate(r.createdAt, r.type.slaDays))}`
        : r.status === "DONE" || r.status === "REJECTED"
          ? `№ ${r.number} · ${fmtDate(r.createdAt)}`
          : `№ ${r.number}`;
    return (
      <Link href={`/requests/${r.id}`} className="group flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-primary/40">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">
          <FileText size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{r.type.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <StatusBadge status={r.status} />
            <span>{next}</span>
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Заявки и справки" subtitle="Справки и заявления — без очереди в деканате" />

      {/* Требует вашего действия */}
      {(needAnswer.length > 0 || ready.length > 0) && (
        <div className="mb-6 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {needAnswer.map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center gap-3 rounded-[24px] bg-warning-soft p-4 transition hover:opacity-90">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-warning">
                <MessageCircleQuestion size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-warning">Деканат ждёт вашего ответа</span>
                <span className="block truncate text-sm">{r.type.title} № {r.number}</span>
              </span>
              <span className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-ink-fg">Ответить</span>
            </Link>
          ))}
          {ready.map((r) =>
            r.certificate ? (
              <div key={r.id} className="flex items-center gap-3 rounded-[24px] bg-success-soft p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-success">
                  <FileText size={20} />
                </span>
                <Link href={`/requests/${r.id}`} className="min-w-0 flex-1">
                  <span className="block font-semibold text-success">Справка готова</span>
                  <span className="block truncate text-sm">{r.type.title} № {r.number}</span>
                </Link>
                <a href={`/api/certificates/${r.id}/pdf`} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-ink-fg">
                  <Download size={15} /> PDF
                </a>
              </div>
            ) : (
              <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center gap-3 rounded-[24px] bg-success-soft p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-success">
                  <FileText size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-success">Готово — заберите в деканате</span>
                  <span className="block truncate text-sm">{r.type.title} № {r.number} · каб. 204</span>
                </span>
              </Link>
            ),
          )}
        </div>
      )}

      {/* Быстрый заказ */}
      <div className="mb-8">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {QUICK.map((q) => (
            <Link key={q.code} href={`/requests/new?type=${q.code}`} className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-ink">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#0e0e10] ${q.tone}`}>
                <q.icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-snug">{q.title}</span>
                <span className="block text-[13px] text-muted">{q.text}</span>
              </span>
            </Link>
          ))}
        </div>
        <ButtonLink href="/requests/new" variant="secondary" className="mt-2 w-full sm:w-auto">
          <FilePlus2 size={18} /> Другое заявление или справка
        </ButtonLink>
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Заявок пока нет" text="Закажите справку или подайте заявление — это займёт минуту." />
      ) : (
        <>
          {inProgress.length > 0 && (
            <>
              <h2 className="mb-2 text-[15px] font-bold">В работе у деканата</h2>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{inProgress.map((r) => <Row key={r.id} r={r} />)}</div>
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
