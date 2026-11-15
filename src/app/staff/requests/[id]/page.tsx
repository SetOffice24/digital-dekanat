import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { getRequest, isOverdue } from "@/server/repos/staff";
import { Badge, ButtonLink, Card, SectionTitle } from "@/components/ui";
import { requestStatusLabel, requestStatusTone } from "@/lib/labels";
import { dueDate, fmtDate, fmtDateTime } from "@/lib/utils";
import { AssignForm, DecisionForm } from "./forms";

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

  return (
    <>
      <Link href="/staff/requests" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Все заявки
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {r.type.title} <span className="text-muted">№ {r.number}</span>
        </h1>
        <Badge tone={requestStatusTone[r.status]}>{requestStatusLabel[r.status]}</Badge>
        {overdue && <Badge tone="danger">Просрочена</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-4">
          <Card>
            <SectionTitle>Студент</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">ФИО</dt><dd className="font-semibold">{fio}</dd>
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
              <dt className="text-muted">Срок</dt><dd>до {fmtDate(dueDate(r.createdAt, r.type.slaDays))} · {r.type.slaDays} раб. дн.</dd>
              <dt className="text-muted">Исполнитель</dt><dd>{r.assignee?.fullName ?? "не назначен"}</dd>
              {r.wantsPaper && (<><dt className="text-muted">Бумажная копия</dt><dd>нужна</dd></>)}
              {fields.map((f) => (
                <FieldRow key={f.name} label={f.label} value={payload[f.name]} />
              ))}
              {r.comment && (<><dt className="text-muted">Комментарий студента</dt><dd className="whitespace-pre-wrap">{r.comment}</dd></>)}
            </dl>
            {r.certificate && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
                <ButtonLink href={`/api/certificates/${r.id}/pdf`} target="_blank" variant="secondary">
                  <FileDown size={18} /> Открыть PDF справки
                </ButtonLink>
                <span className="text-muted">Код проверки {r.certificate.verifyCode} · до {fmtDate(r.certificate.validUntil)}</span>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>История</SectionTitle>
            <ol className="space-y-3">
              {r.events.map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={requestStatusTone[e.toStatus]}>{requestStatusLabel[e.toStatus]}</Badge>
                    <span className="text-xs text-muted">
                      {fmtDateTime(e.createdAt)} · {e.author.role === "STAFF" ? e.author.staff?.fullName ?? "Сотрудник" : "Студент"}
                    </span>
                  </div>
                  {e.message && <p className="mt-1 whitespace-pre-wrap">{e.message}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle>Действия</SectionTitle>
            {closed ? (
              <p className="text-sm text-muted">Заявка закрыта — статус «{requestStatusLabel[r.status]}».</p>
            ) : (
              <DecisionForm id={r.id} status={r.status} isCertificate={r.type.isCertificate} />
            )}
          </Card>
          {r.assignee?.id !== staff.id && !closed && (
            <Card>
              <AssignForm id={r.id} />
            </Card>
          )}
        </div>
      </div>
    </>
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
