import Link from "next/link";
import { CalendarClock, ChevronRight, Download, FilePlus2, FileText, FolderLock, GraduationCap, MessageCircleQuestion, ShieldCheck, Wallet, ArrowRight } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { listRequests } from "@/server/repos/student";
import { listMyDocuments, isUsable } from "@/server/services/documents";
import { myAppointments } from "@/server/services/appointments";
import { getCase, situationsFor } from "@/server/services/situations";
import { stepLabel } from "@/server/services/requests";
import { ButtonLink, PageHeader, Progress } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { situationIcon } from "@/components/services/icons";
import { deanery } from "@/config/services";
import { addDays, cn, dueDate, fmtDate, fmtDateTime, fmtShort, plural } from "@/lib/utils";
import { startCaseAction } from "../services/actions";

export const metadata = { title: "Услуги" };

/** Самое частое — в один клик: сразу открывается нужная форма. */
const QUICK = [
  { code: "CERT_STUDY", title: "Справка об обучении", text: "PDF с QR · сразу", icon: GraduationCap },
  { code: "CERT_SCHOLARSHIP", title: "Справка о стипендии", text: "PDF · за 2 дня", icon: Wallet },
  { code: "CERT_MILITARY", title: "Для военкомата", text: "С печатью · за 3 дня", icon: ShieldCheck },
] as const;

/**
 * Единое окно студента: всё, что раньше требовало похода по кабинетам, — в одном месте.
 * Сверху — что ждёт от студента действия; ниже — «что случилось?» (жизненные ситуации), мои обращения
 * в деканате со сроками и согласованиями, документы и запись на приём, каталог услуг.
 */
export default async function ServicesHub() {
  const { student } = await requireStudent();
  const [requests, docs, appts, sits] = await Promise.all([listRequests(student), listMyDocuments(student), myAppointments(student.id), situationsFor(student.id)]);
  const openCases = (await Promise.all(sits.filter((s) => s.openCaseId).map((s) => getCase(student, s.openCaseId!)))).filter((c): c is NonNullable<typeof c> => !!c);

  const needAnswer = requests.filter((r) => r.status === "NEED_INFO");
  const ready = requests.filter((r) => r.status === "READY");
  const inProgress = requests.filter((r) => r.status === "NEW" || r.status === "IN_REVIEW");
  const archive = requests.filter((r) => ["DONE", "REJECTED"].includes(r.status)).slice(0, 8);
  const nextAppt = appts.filter((a) => a.status === "BOOKED" && a.startsAt > new Date()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  const latestByKind = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (!latestByKind.has(d.kind)) latestByKind.set(d.kind, d);
  const docList = [...latestByKind.values()];
  const horizon = addDays(new Date(), 14);
  const soon = docList.filter((d) => d.validUntil && isUsable(d) && d.validUntil < horizon);
  const rejected = docList.filter((d) => d.status === "REJECTED");

  const Row = ({ r }: { r: (typeof requests)[number] }) => {
    const pending = r.approvals.find((a) => a.status === "PENDING");
    const due = r.dueAt ?? dueDate(r.createdAt, r.type.slaDays);
    const late = (r.status === "NEW" || r.status === "IN_REVIEW") && due < new Date();
    const next = pending
      ? `На согласовании: ${stepLabel(pending)}`
      : r.status === "NEW" || r.status === "IN_REVIEW"
        ? late
          ? "Срок прошёл — на контроле у руководителя"
          : `Будет готово до ${fmtShort(due)}`
        : `№ ${r.number} · ${fmtDate(r.createdAt)}`;
    return (
      <Link href={`/requests/${r.id}`} className="group flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-primary/40">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">
          <FileText size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{r.type.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <StatusBadge status={r.status} />
            <span className={cn(late && "font-semibold text-danger")}>{next}</span>
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Услуги" subtitle="Справки, заявления, выплаты и общежитие — в одном окне деканата, без очередей" />

      {/* ---------- Требует вашего действия ---------- */}
      {(needAnswer.length > 0 || ready.length > 0 || rejected.length > 0) && (
        <div className="mb-8 grid grid-cols-1 gap-2 lg:grid-cols-2">
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
            r.certificate && !r.certificate.revoked && !r.wantsPaper ? (
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
              <div key={r.id} className="flex items-center gap-3 rounded-[24px] bg-success-soft p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-success">
                  <FileText size={20} />
                </span>
                <Link href={`/requests/${r.id}`} className="min-w-0 flex-1">
                  <span className="block font-semibold text-success">Готово — заберите оригинал</span>
                  <span className="block truncate text-sm">{r.type.title} № {r.number} · {deanery.room}</span>
                </Link>
                <Link href={`/services/appointments?request=${r.id}&purpose=${encodeURIComponent(`Забрать: ${r.type.title}`)}`} className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-ink-fg">
                  Записаться
                </Link>
              </div>
            ),
          )}
          {rejected.map((d) => (
            <Link key={d.id} href={`/services/documents?kind=${d.kind}`} className="flex items-center gap-3 rounded-[24px] bg-danger-soft p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-danger">
                <FolderLock size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-danger">Документ не принят — загрузите новый</span>
                <span className="block truncate text-sm">{d.reviewNote}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ---------- Открытые ситуации ---------- */}
      {openCases.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-[15px] font-bold">Ваши планы</h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {openCases.map((c) => {
              const Icon = situationIcon[c.code] ?? FileText;
              const next = c.steps.find((s) => !s.done && !s.optional) ?? c.steps.find((s) => !s.done);
              return (
                <Link key={c.id} href={`/services/case/${c.id}`} className="rounded-[24px] border border-border/70 bg-surface p-4 transition hover:border-ink/40">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-[#0e0e10]", c.situation.tone)}>
                      <Icon size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.situation.title}</span>
                      <span className="block truncate text-[13px] text-muted">{next ? `Дальше: ${next.title}` : "Все шаги выполнены — можно завершить"}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {c.progress.done}/{c.progress.total}
                    </span>
                  </div>
                  <div className="mt-3">
                    <Progress value={(c.progress.done / Math.max(1, c.progress.total)) * 100} tone={c.complete ? "success" : "primary"} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- Что случилось? ---------- */}
      <section className="mb-8">
        <h2 className="text-[15px] font-bold">Что у вас случилось?</h2>
        <p className="mb-3 text-[13px] text-muted">Выберите ситуацию — соберём план из нужных справок, документов и записи в деканат.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sits.map((s) => {
            const Icon = situationIcon[s.code] ?? FileText;
            const inner = (
              <>
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#0e0e10]", s.tone)}>
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-semibold leading-snug">{s.title}</span>
                  <span className="block text-[13px] leading-snug text-muted">{s.openCaseId ? "План уже открыт — продолжить" : s.short}</span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-muted" />
              </>
            );
            const cls = "flex w-full items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-ink";
            return s.openCaseId ? (
              <Link key={s.code} href={`/services/case/${s.openCaseId}`} className={cls}>
                {inner}
              </Link>
            ) : (
              <form key={s.code} action={startCaseAction}>
                <input type="hidden" name="code" value={s.code} />
                <button type="submit" className={cls}>
                  {inner}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      {/* ---------- Документы и приём ---------- */}
      <section className="mb-8 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Link href="/services/documents" className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-4 transition hover:border-ink">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-p-lilac text-[#0e0e10]">
            <FolderLock size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Мои документы</span>
            <span className={cn("block text-[13px]", soon.length ? "font-semibold text-warning" : "text-muted")}>
              {soon.length
                ? `Скоро истекает: ${soon.map((d) => d.kind === "FLUORO" ? "флюорография" : d.kind === "MED_086" ? "медсправка" : "документ").join(", ")}`
                : docList.length
                  ? `${docList.length} ${plural(docList.length, "документ", "документа", "документов")} — подставляются в заявки сами`
                  : "Загрузите один раз — больше не придётся приносить"}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </Link>
        <Link href="/services/appointments" className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-4 transition hover:border-ink">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-p-yellow text-[#0e0e10]">
            <CalendarClock size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Запись на приём</span>
            <span className="block text-[13px] text-muted">{nextAppt ? `Деканат, ${fmtDateTime(nextAppt.startsAt)}` : "В деканат — без очереди"}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </Link>
      </section>

      {/* ---------- Быстрый заказ и все услуги ---------- */}
      <section className="mb-8">
        <h2 className="mb-2 text-[15px] font-bold">Часто заказывают</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {QUICK.map((q) => (
            <Link key={q.code} href={`/requests/new?type=${q.code}`} className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-ink">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-p-mint text-[#0e0e10]">
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
          <FilePlus2 size={18} /> Все услуги деканата
        </ButtonLink>
      </section>

      {/* ---------- Мои обращения ---------- */}
      {inProgress.length > 0 && (
        <>
          <h2 className="mb-2 text-[15px] font-bold">В работе</h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{inProgress.map((r) => <Row key={r.id} r={r} />)}</div>
        </>
      )}
      {archive.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-[15px] font-bold">Завершённые</h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{archive.map((r) => <Row key={r.id} r={r} />)}</div>
        </>
      )}
    </div>
  );
}
