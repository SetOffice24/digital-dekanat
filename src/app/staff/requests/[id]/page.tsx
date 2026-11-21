import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, FileDown } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { absencesInRange, getRequest, isOverdue, nextOpenRequest } from "@/server/repos/staff";
import { Badge, ButtonLink, Card, SectionTitle } from "@/components/ui";
import { requestStatusLabel, requestStatusTone } from "@/lib/labels";
import { dueDate, fmtDate, fmtDateTime, fmtShort, parseIsoDate } from "@/lib/utils";
import { AssignForm, DecisionForm, MobileDecisionBar } from "./forms";
import { DocReview } from "@/components/services/desk";
import { RevokeButton } from "@/app/staff/services/parts";
import { stepLabel } from "@/server/services/requests";
import { docKinds } from "@/config/services";

export const metadata = { title: "Заявка" };

type Field = { name: string; label: string };

export default async function StaffRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireStaff();
  const { id } = await params;
  const r = await getRequest(staff, id);
  if (!r) notFound();

  const fields = (Array.isArray(r.type.fields) ? r.type.fields : []) as Field[];
  const payload = (r.payload ?? {}) as Record<string, unknown>;
  const s = r.student;
  const closed = r.status === "DONE" || r.status === "REJECTED";
  const overdue = isOverdue(r);
  const fio = [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");
  const n = await nextOpenRequest(staff, r.id);
  // заявление о пропуске: сразу показываем, какие пары отмечены как пропущенные за эти даты
  const from = r.type.code === "APP_ABSENCE" ? parseIsoDate(String(payload.dateFrom ?? "")) : null;
  const to = r.type.code === "APP_ABSENCE" ? parseIsoDate(String(payload.dateTo ?? "")) : null;
  const absences = from && to ? await absencesInRange(staff, s.id, from, to) : null;
  const next = n ? { id: n.id, number: n.number, title: n.type.title } : null;
  // «назад» — в ту вкладку входящих, где лежит заявка
  const routeOpen = r.approvals.some((a) => a.status === "PENDING" || a.status === "WAITING");
  const pendingStep = r.approvals.find((a) => a.status === "PENDING");
  const due = r.dueAt ?? dueDate(r.createdAt, r.type.slaDays);
  const backTab = { NEW: "new", IN_REVIEW: "work", NEED_INFO: "wait", READY: "ready", DONE: "done", REJECTED: "done" }[r.status];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/staff?tab=${backTab}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
          <ArrowLeft size={16} /> К заявкам
        </Link>
        {next && (
          <Link href={`/staff/requests/${next.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-fg">
            Следующая <ArrowRight size={16} />
          </Link>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {r.type.title} <span className="text-muted">№ {r.number}</span>
        </h1>
        <Badge tone={requestStatusTone[r.status]}>{requestStatusLabel[r.status]}</Badge>
        {overdue && <Badge tone="danger">{r.escalatedAt ? "Просрочена · у руководителя" : "Просрочена"}</Badge>}
        {r.autoIssued && <Badge tone="success">Выдана автоматически</Badge>}
        {r.certificate?.revoked && <Badge tone="danger">Справка отозвана</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-4">
          <Card>
            <SectionTitle>Студент</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">ФИО</dt><dd><Link href={`/staff/students/${s.id}`} className="font-semibold underline-offset-2 hover:underline">{fio}</Link> <span className="text-xs text-muted">· личное дело · <Link href={`/staff/messages/new?to=${s.userId}&ctx=REQUEST&id=${r.id}`} className="underline underline-offset-2 hover:text-fg">написать студенту</Link></span></dd>
              <dt className="text-muted">Группа</dt><dd>{s.group.name}</dd>
              <dt className="text-muted">Курс</dt><dd>{s.course}</dd>
              <dt className="text-muted">Факультет</dt><dd>{s.faculty.name}</dd>
              <dt className="text-muted">Направление</dt><dd>{s.program.name}</dd>
            </dl>
          </Card>

          <Card>
            <SectionTitle>Данные заявки</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Подана</dt><dd>{fmtDateTime(r.createdAt)}</dd>
              <dt className="text-muted">Срок</dt><dd>до {fmtDate(due)} · {r.type.slaDays} раб. дн.</dd>
              <dt className="text-muted">Исполнитель</dt><dd>{r.assignee?.fullName ?? "не назначен"}</dd>
              {r.wantsPaper && (<><dt className="text-muted">Бумажная копия</dt><dd>нужна</dd></>)}
              {fields.map((f) => (
                <FieldRow key={f.name} label={f.label} value={payload[f.name]} />
              ))}
              {r.comment && (<><dt className="text-muted">Комментарий студента</dt><dd className="whitespace-pre-wrap">{r.comment}</dd></>)}
            </dl>
            {absences && (
              <div className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">
                <p className="font-semibold">
                  {absences.length ? `По журналу посещаемости за эти даты пропущено ${absences.length} ${absences.length === 1 ? "пара" : absences.length < 5 ? "пары" : "пар"}` : "По журналу посещаемости пропусков за эти даты нет"}
                </p>
                {absences.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-muted">
                    {absences.slice(0, 10).map((a, i) => (
                      <li key={i}>
                        {fmtShort(a.lesson.date)}, {a.lesson.startTime} — {a.lesson.course.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {r.certificate && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
                <ButtonLink href={`/api/certificates/${r.id}/pdf`} target="_blank" variant="secondary">
                  <FileDown size={18} /> Открыть PDF справки
                </ButtonLink>
                <span className="text-muted">Код проверки {r.certificate.verifyCode} · до {fmtDate(r.certificate.validUntil)}</span>
                {!r.certificate.revoked && <RevokeButton requestId={r.id} />}
                {r.certificate.revoked && <span className="font-semibold text-danger">Отозвана: {r.certificate.revokeReason}</span>}
              </div>
            )}
          </Card>

          {r.approvals.length > 0 && (
            <Card>
              <SectionTitle>Путь согласования</SectionTitle>
              <ol className="space-y-2 text-sm">
                {r.approvals.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{a.idx + 1}. {stepLabel(a)}</span>
                    <span className={a.status === "APPROVED" ? "text-success" : a.status === "REJECTED" ? "text-danger" : a.status === "PENDING" ? "font-semibold text-warning" : "text-muted"}>
                      {a.status === "APPROVED" ? "согласовано" : a.status === "REJECTED" ? "отклонено" : a.status === "PENDING" ? "ждёт решения" : "в очереди"}
                    </span>
                    {a.decidedAt && <span className="text-muted">{fmtDateTime(a.decidedAt)}</span>}
                    {a.comment && <span className="basis-full rounded-xl bg-surface-2 px-3 py-1.5">{a.comment}</span>}
                  </li>
                ))}
                <li className="text-muted">→ после согласования заявку выполняет деканат</li>
              </ol>
            </Card>
          )}

          {r.documents.length > 0 && (
            <Card>
              <SectionTitle>Документы студента</SectionTitle>
              <DocReview path={`/staff/requests/${r.id}`} docs={r.documents.map(({ document: d }) => ({ id: d.id, title: docKinds[d.kind].title, status: d.status, validUntil: d.validUntil ? fmtDate(d.validUntil) : null, note: d.reviewNote }))} />
            </Card>
          )}

          {r.rating != null && (
            <Card>
              <SectionTitle>Оценка студента</SectionTitle>
              <p className="text-sm">
                <b className="text-[#d08a00]">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</b>
                {r.ratingComment ? ` — «${r.ratingComment}»` : ""}
              </p>
            </Card>
          )}

          <Card>
            <SectionTitle>История</SectionTitle>
            <ol className="space-y-3">
              {r.events.map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.fromStatus === e.toStatus ? "neutral" : requestStatusTone[e.toStatus]}>{e.fromStatus === e.toStatus ? "Согласование" : requestStatusLabel[e.toStatus]}</Badge>
                    <span className="text-xs text-muted">
                      {fmtDateTime(e.createdAt)} · {e.author.role === "STAFF" ? e.author.staff?.fullName ?? "Сотрудник" : e.author.role === "TEACHER" ? e.author.teacher?.fullName ?? "Преподаватель" : "Студент"}
                    </span>
                  </div>
                  {e.message && <p className="mt-1 whitespace-pre-wrap">{e.message}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card id="actions" className="scroll-mt-24">
            <SectionTitle>Действия</SectionTitle>
            {/* перед «Справка готова» — посмотреть текст будущей справки */}
            {r.type.isCertificate && !r.certificate && !closed && (
              <a href={`/api/certificates/${r.id}/preview`} target="_blank" rel="noopener" className="mb-4 flex items-center gap-3 rounded-2xl bg-p-mint/60 p-3 text-sm transition hover:bg-p-mint">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface"><Eye size={17} /></span>
                <span className="min-w-0">
                  <span className="block font-semibold">Посмотреть справку до выдачи</span>
                  <span className="block text-xs text-muted">PDF-образец с данными студента</span>
                </span>
              </a>
            )}
            {routeOpen && !closed ? (
              <p className="text-sm text-muted">Заявка на согласовании{pendingStep ? `: ${stepLabel(pendingStep)}` : ""}. Решение станет доступно, когда маршрут будет пройден.</p>
            ) : closed ? (
              <p className="text-sm text-muted">Заявка закрыта — статус «{requestStatusLabel[r.status]}».</p>
            ) : (
              <DecisionForm id={r.id} status={r.status} isCertificate={r.type.isCertificate} next={next} />
            )}
          </Card>
          {/* «Взять в работу» и так назначает исполнителя — отдельная кнопка нужна только для чужих заявок в работе */}
          {r.status !== "NEW" && r.assignee?.id !== staff.id && !closed && (
            <Card>
              <AssignForm id={r.id} />
            </Card>
          )}
        </div>
      </div>
      <MobileDecisionBar id={r.id} status={r.status} isCertificate={r.type.isCertificate} closed={closed || routeOpen} next={next} />
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  const raw = value == null || value === "" ? "—" : String(value);
  // даты из форм (YYYY-MM-DD) показываем по-человечески
  const text = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(raw + "T00:00:00Z")) : raw;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap">{text}</dd>
    </>
  );
}
