import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Check, CalendarClock, Clock, Download, ExternalLink, FileText, Stamp, X, MessagesSquare, Zap } from "lucide-react";
import { stepLabel as routeLabel } from "@/server/services/requests";
import { situationByCode } from "@/config/situations";
import { deanery, docKinds } from "@/config/services";
import { RateForm } from "./rate-form";
import { requireStudent } from "@/server/auth";
import { getRequest } from "@/server/repos/student";
import { Card, SectionTitle } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { parseFields } from "@/lib/request-fields";
import { requestStatusLabel } from "@/lib/labels";
import { cn, dueDate, fmtDate, fmtDateTime } from "@/lib/utils";
import { AnswerForm } from "./answer-form";

export const metadata = { title: "Заявка" };

const STEPS = ["NEW", "IN_REVIEW", "READY", "DONE"] as const;
const stepLabel = { NEW: "Отправлена", IN_REVIEW: "В работе", READY: "Готова", DONE: "Выдана" };

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { student } = await requireStudent();
  const { id } = await params;
  const { created } = await searchParams;
  const r = await getRequest(student, id);
  if (!r) notFound(); // чужая или несуществующая — одинаковый ответ

  const fields = parseFields(r.type.fields);
  const payload = (r.payload ?? {}) as Record<string, string>;
  const rejected = r.status === "REJECTED";
  const stepIndex = r.status === "NEED_INFO" ? 1 : rejected ? -1 : STEPS.indexOf(r.status as (typeof STEPS)[number]);
  const verifyUrl = r.certificate ? `${process.env.APP_URL ?? ""}/verify/${r.certificate.verifyCode}` : null;
  const qr = verifyUrl ? await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 }) : null;
  const dep = deanery;
  const due = r.dueAt ?? dueDate(r.createdAt, r.type.slaDays);
  const pending = r.approvals.find((a) => a.status === "PENDING");
  const late = (r.status === "NEW" || r.status === "IN_REVIEW") && !pending && due < new Date();
  const finished = r.status === "READY" || r.status === "DONE" || r.status === "REJECTED";
  const needsVisit = r.status === "READY" && (r.wantsPaper || !r.certificate);
  const who = (role: string) => (role === "STAFF" ? "деканат" : role === "TEACHER" ? "преподаватель" : "вы");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/requests" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Все заявки
      </Link>

      {created && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-success-soft p-3 text-sm font-semibold text-success" role="status">
          <Check size={18} /> Заявка отправлена. Статус обновится здесь и в уведомлениях.
        </div>
      )}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">{r.type.title}</h1>
          <p className="mt-0.5 text-sm text-muted">
            № {r.number} · от {fmtDate(r.createdAt)} · срок — до {fmtDate(due)}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          <Link href={`/messages/new?ctx=REQUEST&id=${r.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-ink">
            <MessagesSquare size={16} /> Написать в деканат по этой заявке
          </Link>
        )}
        {r.case && (
          <Link href={`/services/case/${r.case.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-ink">
            План «{situationByCode(r.case.code)?.title}»
          </Link>
        )}
      </div>
      {r.autoIssued && !r.certificate?.revoked && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success">
          <Zap size={15} /> Выдана автоматически сразу после заказа — без очереди
        </p>
      )}
      {late && (
        <p className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          Срок по регламенту прошёл{r.escalatedAt ? " — заявка на контроле у руководителя деканата" : ""}. Мы уже разбираемся.
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
      <div className="min-w-0">
      {/* Трекер */}
      <Card>
        {rejected ? (
          <div className="flex items-center gap-3 text-danger">
            <span className="flex size-9 items-center justify-center rounded-full bg-danger-soft">
              <X size={18} />
            </span>
            <span className="font-bold">Заявка отклонена — причина в истории ниже</span>
          </div>
        ) : (
          <ol className="grid grid-cols-4 gap-1">
            {STEPS.map((s, i) => {
              const done = i <= stepIndex;
              const currentStep = i === stepIndex;
              return (
                <li key={s} className="flex flex-col items-center text-center">
                  <div className="relative flex w-full items-center justify-center">
                    {i > 0 && <span className={cn("absolute right-1/2 top-1/2 h-0.5 w-full -translate-y-1/2", i <= stepIndex ? "bg-primary" : "bg-border")} />}
                    <span className={cn("relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold", done ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface text-muted", currentStep && "ring-4 ring-primary-soft")}>
                      {done ? <Check size={15} /> : i + 1}
                    </span>
                  </div>
                  <span className={cn("mt-1.5 text-[11px] font-semibold leading-tight", done ? "text-fg" : "text-muted")}>{stepLabel[s]}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {r.approvals.length > 0 && (
        <>
          <SectionTitle>Путь согласования</SectionTitle>
          <Card className="p-0">
            <ol className="divide-y divide-border">
              {r.approvals.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3">
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", a.status === "APPROVED" ? "bg-success text-white" : a.status === "REJECTED" ? "bg-danger text-white" : a.status === "PENDING" ? "bg-p-yellow text-[#0e0e10]" : "border-2 border-border text-muted")}>
                    {a.status === "APPROVED" ? <Check size={15} /> : a.status === "REJECTED" ? <X size={15} /> : <Clock size={14} />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">{routeLabel(a)}</span>
                    <span className="block text-muted">{a.status === "APPROVED" ? `согласовано ${a.decidedAt ? fmtDate(a.decidedAt) : ""}` : a.status === "REJECTED" ? "не согласовано" : a.status === "PENDING" ? "рассматривает сейчас" : "следующий шаг"}</span>
                    {a.comment && <span className="mt-1 block rounded-xl bg-surface-2 px-3 py-1.5">{a.comment}</span>}
                  </span>
                </li>
              ))}
              <li className="flex gap-3 px-4 py-3 text-sm">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-muted">
                  <FileText size={13} />
                </span>
                <span>
                  <span className="block font-semibold">Деканат</span>
                  <span className="text-muted">выполняет заявку после согласования</span>
                </span>
              </li>
            </ol>
          </Card>
        </>
      )}

      {/* Что дальше — одной фразой, чтобы не гадать */}
      {pending && r.status === "NEW" && (
        <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          Сейчас заявку рассматривает: <b>{routeLabel(pending)}</b>. После согласования она сама уйдёт дальше — следить не нужно.
        </p>
      )}
      {!pending && (r.status === "NEW" || r.status === "IN_REVIEW") && (
        <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          {r.status === "NEW" ? "Заявка у деканата. " : "Деканат уже занимается заявкой. "}
          {r.type.isCertificate ? "Справка" : "Решение"} — до <b>{fmtDate(due)}</b>. Как только статус изменится, придёт уведомление.
        </p>
      )}

      {r.status === "NEED_INFO" && (
        <div className="mt-4 rounded-2xl border border-warning/40 bg-warning-soft p-4">
          <div className="font-bold text-warning">Деканат просит уточнить</div>
          <p className="mt-1 text-sm">{[...r.events].reverse().find((e) => e.toStatus === "NEED_INFO")?.message}</p>
          <AnswerForm id={r.id} />
        </div>
      )}

      {r.certificate?.revoked && (
        <div className="mt-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <div className="font-bold text-danger">Справка отозвана</div>
          <p className="mt-1">{r.certificate.revokeReason ?? "Обратитесь в деканат."} Закажите новую справку или напишите в деканат.</p>
        </div>
      )}

      {needsVisit && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-success-soft p-4 text-sm">
          <CalendarClock size={20} className="shrink-0 text-success" />
          <span className="min-w-0 flex-1">
            {r.appointments[0] ? (
              <>
                Вы записаны: <b>{fmtDateTime(r.appointments[0].startsAt)}</b>, {deanery.room}.
              </>
            ) : (
              <>Оригинал готов — заберите: {dep.room}. Запишитесь, чтобы прийти без очереди.</>
            )}
          </span>
          {!r.appointments[0] && (
            <Link href={`/services/appointments?request=${r.id}&purpose=${encodeURIComponent(`Забрать: ${r.type.title}`)}`} className="shrink-0 rounded-full bg-ink px-4 py-2 font-semibold text-ink-fg">
              Записаться
            </Link>
          )}
        </div>
      )}

      {r.certificate && !r.certificate.revoked && (r.status === "READY" || r.status === "DONE") && (
        <>
          <SectionTitle>Электронная справка</SectionTitle>
          <Card className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR-код для проверки подлинности справки" className="size-36 rounded-xl border border-border bg-white p-1" />
            )}
            <div className="w-full min-w-0 text-center sm:text-left">
              <p className="text-sm text-muted">Справка подписана электронно. Получатель может проверить подлинность по QR-коду.</p>
              <p className="mt-1 text-xs text-muted">Действительна до {fmtDate(r.certificate.validUntil)}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <a href={`/api/certificates/${r.id}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-semibold text-ink-fg">
                  <Download size={17} /> Скачать PDF
                </a>
                <a href={`/verify/${r.certificate.verifyCode}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-surface-2 px-5 text-sm font-semibold">
                  <ExternalLink size={16} /> Страница проверки
                </a>
              </div>
              {r.wantsPaper && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-semibold">
                  <Stamp size={14} /> Бумажная копия — {dep.room}, {dep.hours}
                </p>
              )}
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Данные заявки</SectionTitle>
      <Card className="divide-y divide-border p-0">
        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
            <span className="shrink-0 text-sm text-muted sm:w-44">{f.label}</span>
            <span className="text-sm font-semibold">{payload[f.name] || "—"}</span>
          </div>
        ))}
        {r.type.isCertificate && (
          <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
            <span className="shrink-0 text-sm text-muted sm:w-44">Бумажная копия</span>
            <span className="text-sm font-semibold">{r.wantsPaper ? "Нужна" : "Не нужна"}</span>
          </div>
        )}
      </Card>

      {r.documents.length > 0 && (
        <>
          <SectionTitle>Приложенные документы</SectionTitle>
          <Card className="divide-y divide-border p-0">
            {r.documents.map(({ document: d }) => (
              <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2/50">
                <FileText size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 font-semibold">{docKinds[d.kind].title}</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", d.status === "VERIFIED" ? "bg-success-soft text-success" : d.status === "REJECTED" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
                  {d.status === "VERIFIED" ? "проверен" : d.status === "REJECTED" ? "не принят" : "на проверке"}
                </span>
              </a>
            ))}
          </Card>
        </>
      )}

      {finished && (
        <>
          <SectionTitle>Как всё прошло?</SectionTitle>
          <Card>
            {r.rating ? (
              <p className="text-sm">
                Ваша оценка: <b>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</b>
                {r.ratingComment ? ` — «${r.ratingComment}»` : ""}. Спасибо!
              </p>
            ) : (
              <RateForm id={r.id} />
            )}
          </Card>
        </>
      )}

      </div>
      <div className="min-w-0 lg:sticky lg:top-8">
      <SectionTitle className="lg:mt-0">История</SectionTitle>
      <ol className="relative ml-3 border-l-2 border-border pl-5">
        {r.events.map((e) => (
          <li key={e.id} className="relative pb-4 last:pb-0">
            <span className={cn("absolute -left-[27px] top-1 size-3 rounded-full border-2 border-surface", e.author.role !== "STUDENT" ? "bg-primary" : "bg-muted")} />
            <div className="text-sm font-bold">{e.fromStatus === e.toStatus ? "Согласование" : requestStatusLabel[e.toStatus]}</div>
            <div className="text-xs text-muted">
              {fmtDateTime(e.createdAt)} · {who(e.author.role)}
            </div>
            {e.message && <p className="mt-1 rounded-xl bg-surface px-3 py-2 text-sm">{e.message}</p>}
          </li>
        ))}
      </ol>
      </div>
      </div>
    </div>
  );
}
