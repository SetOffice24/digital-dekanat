import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Download, MessagesSquare } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { studentFile } from "@/server/repos/analytics";
import { staffStudentPhotos } from "@/server/repos/photos";
import { PhotoReview } from "../photos/review";
import { ACTION_LABEL, studentAccount } from "@/server/repos/accounts";
import { listGroups } from "@/server/repos/staff";
import { AccountControls } from "./account";
import { PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { forecastLabel, isBelow } from "@/lib/grading";
import { hwState } from "@/lib/homework";
import { assessmentLabel, gradeText } from "@/lib/labels";
import { cn, fmtDate, fmtDateTime, fmtShort } from "@/lib/utils";

export const metadata = { title: "Личное дело" };

const fmtAvg = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));

/** Личное дело студента для деканата: всё о студенте на одной странице. Студент другого факультета — 404. */
export default async function StudentFilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { staff } = await requireStaff();
  const { studentId } = await params;
  const [file, photos, account, groups] = await Promise.all([studentFile(staff, studentId), staffStudentPhotos(staff, studentId), studentAccount(staff, studentId), listGroups(staff)]);
  if (!file || !photos || !account) notFound();
  const u = account.user;
  const pendingPhoto = photos.latest?.status === "PENDING" ? photos.latest : null;
  const { student: s, attendance, homework } = file;
  const fio = [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");
  const hwOpen = homework.filter((h) => h.state === "overdue" || h.state === "returned").length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href={`/staff/students?group=${s.group.id}`} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Ведомость {s.group.name}
      </Link>
      <PageHeader title={fio} subtitle={`${s.group.name} · ${s.course} курс · ${s.faculty.name}`} action={<Link href={`/staff/messages/new?to=${s.userId}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-ink"><MessagesSquare size={16} /> Написать студенту</Link>} />

      {/* Главное одной строкой */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "средний балл", value: fmtAvg(file.avg), bad: false },
          { label: "долгов", value: String(file.debts.length), bad: file.debts.length > 0 },
          { label: "посещаемость", value: attendance.percent != null ? `${attendance.percent}%` : "—", bad: attendance.percent != null && attendance.percent < 80 },
          { label: "ДЗ: не сдано / на доработке", value: String(hwOpen), bad: hwOpen > 0 },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-border/70 bg-surface p-3">
            <div className={cn("font-head text-2xl font-semibold tabular-nums", x.bad && "text-danger")}>{x.value}</div>
            <div className="text-xs text-muted">{x.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {/* Успеваемость */}
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Успеваемость</h2>
            {file.debts.length > 0 && (
              <p className="mb-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
                Долги: {file.debts.map((d) => `${d.course} (${d.semester} сем.)`).join(", ")}
              </p>
            )}
            <div className="space-y-2">
              {file.semesters.map((sem) => (
                <details key={sem.semester} open={sem.current} className="group rounded-[24px] border border-border/70 bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
                    {sem.semester} семестр{sem.current ? " · сейчас" : ""}
                    <ChevronRight size={17} className="text-muted transition group-open:rotate-90" />
                  </summary>
                  <ul className="divide-y divide-border/60 border-t border-border/60">
                    {sem.items.map((it) => {
                      const bad = it.score ? isBelow(it.score.forecast) : it.final === "2" || it.final === "FAIL";
                      return (
                        <li key={it.course.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{it.course.name}</span>
                            <span className="text-xs text-muted">{assessmentLabel[it.course.assessment as keyof typeof assessmentLabel]}</span>
                          </span>
                          <span className={cn("shrink-0 text-right text-sm tabular-nums", bad && "font-semibold text-danger")}>
                            {it.score ? (
                              <>
                                {it.score.points}/{it.score.max} · {forecastLabel(it.score.forecast)}
                              </>
                            ) : sem.current ? (
                              <span className="text-muted">нет оценок</span>
                            ) : it.final ? (
                              gradeText(it.final)
                            ) : (
                              "—"
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          {/* Домашние задания */}
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Домашние задания</h2>
            {homework.length === 0 ? (
              <p className="rounded-[24px] border border-border/70 bg-surface px-4 py-3 text-sm text-muted">Заданий пока не было.</p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
                {homework.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="text-xs text-muted">
                        {h.course.name} · до {fmtDateTime(h.dueAt)}
                        {h.submittedAt && h.submittedAt > h.dueAt && " · сдано позже срока"}
                      </span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", hwState[h.state].cls)}>{hwState[h.state].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {/* Данные */}
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Данные студента</h2>
            {/* Фото для документов: действующее (скачать для пропуска) и новое на проверке */}
            <div className="mb-2 flex flex-wrap gap-4 rounded-[24px] border border-border/70 bg-surface p-4 sm:p-5">
              {photos.current ? (
                <div className="flex items-end gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- защищённый маршрут */}
                  <img src={`/api/photos/${photos.current.id}`} alt="Фото студента" width={90} height={120} className="h-[120px] w-[90px] rounded-xl object-cover" />
                  <a href={`/api/photos/${photos.current.id}?download=1`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:border-ink">
                    <Download size={15} /> Для пропуска
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted">{pendingPhoto ? "Действующего фото пока нет." : "Фото для документов не загружено."}</p>
              )}
              {pendingPhoto && (
                <div className="flex min-w-0 gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- защищённый маршрут */}
                  <img src={`/api/photos/${pendingPhoto.id}`} alt="Новое фото на проверке" width={90} height={120} className="h-[120px] w-[90px] shrink-0 rounded-xl object-cover ring-2 ring-p-yellow" />
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm">Новое фото на проверке</p>
                    <PhotoReview id={pendingPhoto.id} />
                  </div>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[24px] border border-border/70 bg-surface p-4 text-sm sm:p-5">
              <dt className="text-muted">Направление</dt>
              <dd>
                {s.program.code} {s.program.name}
              </dd>
              <dt className="text-muted">Группа</dt>
              <dd>
                {s.group.name}, подгруппа {s.subgroup}
              </dd>
              <dt className="text-muted">Зачётка</dt>
              <dd>{s.recordBookNo}</dd>
              <dt className="text-muted">Стипендия</dt>
              <dd>{s.scholarship ? "Академическая" : "Не назначена"}</dd>
              <dt className="text-muted">Почта</dt>
              <dd className="break-all">{s.email ?? "—"}</dd>
              <dt className="text-muted">Логин</dt>
              <dd>{s.user.login}</dd>
            </dl>
          </section>

          {/* Аккаунт: статус, вход, действия деканата, журнал */}
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Аккаунт</h2>
            <div className="space-y-3 rounded-[24px] border border-border/70 bg-surface p-4 sm:p-5">
              {u.blockedAt ? (
                <p className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
                  <b className="font-semibold">Заблокирован {fmtDate(u.blockedAt)}.</b> {u.blockReason}
                </p>
              ) : u.mustChangePassword ? (
                <p className="rounded-2xl bg-p-yellow px-4 py-2.5 text-sm text-[#0e0e10]">Выдан временный пароль — студент ещё не задал свой.</p>
              ) : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Логин</dt>
                <dd className="break-all">{u.login}</dd>
                <dt className="text-muted">Последний вход</dt>
                <dd>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="font-semibold text-danger">ни разу</span>}</dd>
                <dt className="text-muted">Устройства</dt>
                <dd>
                  вход на {u._count.sessions}, push на {u._count.pushSubs}
                </dd>
              </dl>
              <AccountControls studentId={s.id} login={u.login} blocked={Boolean(u.blockedAt)} groupId={account.groupId} subgroup={account.subgroup} groups={groups} />
              {account.events.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-muted hover:text-fg">История аккаунта ({account.events.length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {account.events.map((e) => (
                      <li key={e.id}>
                        <span className="text-muted">{fmtDateTime(e.createdAt)}</span> · {ACTION_LABEL[e.action]}
                        {e.details ? `: ${e.details}` : ""}
                        <span className="text-muted"> — {e.actor.staff?.fullName ?? (e.actor.student ? "сам студент" : e.actor.login)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </section>

          {/* Посещаемость */}
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Посещаемость</h2>
            <div className="rounded-[24px] border border-border/70 bg-surface p-4 sm:p-5">
              {attendance.total === 0 ? (
                <p className="text-sm text-muted">Отметок пока нет.</p>
              ) : (
                <>
                  <ul className="space-y-1.5 text-sm">
                    {attendance.byCourse.map((c) => (
                      <li key={c.name} className="flex justify-between gap-3">
                        <span className="truncate">{c.name}</span>
                        <span className={cn("shrink-0 tabular-nums", (c.percent ?? 100) < 80 && "font-semibold text-danger")}>
                          {c.percent}% <span className="text-muted">({c.present}/{c.total})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {attendance.recentAbsences.length > 0 && (
                    <div className="mt-3 border-t border-border/60 pt-2 text-sm text-muted">
                      <div className="text-xs font-semibold">Последние пропуски</div>
                      {attendance.recentAbsences.map((l, i) => (
                        <div key={i}>
                          {fmtShort(l.date)}, {l.startTime} — {l.course.name}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Заявки */}
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Заявки</h2>
            {s.requests.length === 0 ? (
              <p className="rounded-[24px] border border-border/70 bg-surface px-4 py-3 text-sm text-muted">Заявок нет.</p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
                {s.requests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/staff/requests/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.type.title}</span>
                        <span className="text-xs text-muted">
                          № {r.number} · {fmtDate(r.createdAt)}
                        </span>
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
