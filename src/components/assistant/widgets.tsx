"use client";
/**
 * Мини-разделы в ответах помощника: кусок настоящего раздела прямо в чате (расписание, оценки, задания,
 * отметка посещаемости, проверка работ, входящие заявки, расписание группы, фото, аккаунты).
 * Данные всегда свежие (/api/assistant/widget), действия — те же функции, что и на обычных страницах.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Check, ChevronLeft, ChevronRight, LoaderCircle, Paperclip, RotateCcw, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileInput } from "@/components/file-input";
import { AttendanceForm } from "@/components/attendance-form";
import { recognizeAbsenceAction, saveAttendanceAction } from "@/app/teacher/lesson/[lessonId]/actions";
import { reviewAction } from "@/app/teacher/[groupId]/[courseId]/homework/[assignmentId]/actions";
import { quickStatusAction } from "@/app/staff/inbox-actions";
import { reviewPhotoAction } from "@/app/staff/students/photos/actions";
import { cancelFromChatAction } from "@/app/staff/move-actions";
import { deleteReminderAction } from "@/app/reminder-actions";

export type WidgetRef = { type: string; params: Record<string, string> };
type Ask = (message: string, tool?: string, label?: string) => void;

/* eslint-disable @typescript-eslint/no-explicit-any -- данные мини-раздела приходят с сервера в форме своего типа */
function useWidget(type: string, initial: Record<string, string>) {
  const [params, setParams] = useState(initial);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/assistant/widget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, params }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && (setData(d), setError(false)))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [type, params, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, params, setParams, reload };
}

const Shell = ({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) => (
  <div className="mt-3 max-w-xl rounded-[24px] border border-border/60 bg-surface">
    <div className="flex min-h-14 items-center gap-2 px-4 pt-1">
      <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</div>
      {right}
    </div>
    <div className="px-2 pb-2">{children}</div>
  </div>
);
const Loading = () => (
  <div className="mt-3 flex max-w-xl items-center gap-2 rounded-2xl border border-border/70 bg-surface p-4 text-sm text-muted">
    <LoaderCircle size={16} className="animate-spin" /> Загружаю…
  </div>
);
const Failed = () => <p className="mt-3 max-w-xl rounded-2xl bg-surface-2 p-3 text-sm text-muted">Не удалось загрузить — откройте раздел в меню.</p>;
const DayNav = ({ d, go }: { d: any; go: (date: string) => void }) => (
  <div className="flex items-center gap-1">
    <button type="button" onClick={() => go(d.prev)} aria-label="Предыдущий день" className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2">
      <ChevronLeft size={17} />
    </button>
    {d.today && d.date !== d.today && (
      <button type="button" onClick={() => go(d.today)} className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
        сегодня
      </button>
    )}
    <button type="button" onClick={() => go(d.next)} aria-label="Следующий день" className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2">
      <ChevronRight size={17} />
    </button>
  </div>
);
const chip = (tone: "ok" | "warn" | "bad" | "muted") => cn("shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold", tone === "ok" ? "bg-success-soft text-success" : tone === "warn" ? "bg-p-yellow text-[#0e0e10]" : tone === "bad" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted");
const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition disabled:opacity-50";

export function WidgetView({ widget, ask, onNavigate }: { widget: WidgetRef; ask: Ask; onNavigate?: () => void }) {
  switch (widget.type) {
    case "student.schedule":
      return <StudentSchedule p={widget.params} />;
    case "student.grades":
      return <StudentGrades onNavigate={onNavigate} />;
    case "student.homework":
      return <StudentHomework onNavigate={onNavigate} />;
    case "student.attendance":
      return <StudentAttendance />;
    case "student.requests":
      return <StudentRequests onNavigate={onNavigate} />;
    case "teacher.day":
      return <TeacherDay p={widget.params} />;
    case "teacher.attendance":
      return <TeacherAttendance lessonId={widget.params.lessonId} phrase={widget.params.phrase} />;
    case "teacher.reviews":
      return <TeacherReviews />;
    case "staff.inbox":
      return <StaffInbox p={widget.params} onNavigate={onNavigate} />;
    case "staff.groupday":
      return <StaffGroupDay p={widget.params} ask={ask} />;
    case "staff.photos":
      return <StaffPhotos onNavigate={onNavigate} />;
    case "student.today":
      return <TodayWidget role="STUDENT" ask={ask} onNavigate={onNavigate} />;
    case "teacher.today":
      return <TodayWidget role="TEACHER" ask={ask} onNavigate={onNavigate} />;
    case "staff.today":
      return <TodayWidget role="STAFF" ask={ask} onNavigate={onNavigate} />;
    case "any.reminders":
      return <RemindersList />;
    case "staff.accounts":
      return <StaffAccounts p={widget.params} onNavigate={onNavigate} />;
    default:
      return null;
  }
}

/* ---------------- студент ---------------- */

function StudentSchedule({ p }: { p: Record<string, string> }) {
  const w = useWidget("student.schedule", p);
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  return (
    <Shell title={d.title} right={<DayNav d={d} go={(date) => w.setParams({ date })} />}>
      {d.lessons.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Пар нет.</p>
      ) : (
        <ul className="space-y-2">
          {d.lessons.map((l: any) => (
            <li key={l.id} className={cn("flex gap-3 rounded-2xl bg-surface-2/70 px-3.5 py-3", l.status === "CANCELLED" && "opacity-60")}>
              <div className="w-14 shrink-0 font-semibold tabular-nums">{l.start}</div>
              <div className="min-w-0 flex-1 text-[15px]">
                <div className={cn("font-medium", l.status === "CANCELLED" && "line-through")}>{l.course}</div>
                <div className="mt-0.5 text-[13px] text-muted">
                  ауд. {l.room} · {l.teacher}
                </div>
                {l.status !== "SCHEDULED" && <div className="mt-0.5 text-xs font-semibold text-warning">{l.status === "CANCELLED" ? "Отменена" : "Изменена"}{l.note ? `: ${l.note}` : ""}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function StudentGrades({ onNavigate }: { onNavigate?: () => void }) {
  const w = useWidget("student.grades", {});
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  return (
    <Shell title={`${d.semester} семестр, прогноз`} right={<Link href="/grades" onClick={onNavigate} className="text-[13px] font-semibold text-muted hover:text-fg">Учёба →</Link>}>
      {/* одна строка — одна дисциплина: название и баллы слева, прогноз крупно справа; цвет — только у риска */}
      <ul className="divide-y divide-border/50 px-2">
        {d.rows.map((r: any) => (
          <li key={r.course} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px]">{r.course}</div>
              <div className="mt-0.5 text-[13px] tabular-nums text-muted">{r.ratio != null ? `${r.points} из ${r.max} баллов · ${Math.round(r.ratio * 100)} %` : "оценок пока нет"}</div>
            </div>
            {r.forecast && <span className={cn("shrink-0 text-[15px] font-semibold", r.low && "text-danger")}>{r.forecast}</span>}
          </li>
        ))}
      </ul>
      {d.debts.length > 0 && <p className="mx-2 mt-1 rounded-2xl bg-danger-soft px-3.5 py-3 text-[15px] text-danger">Долги: {d.debts.join(", ")}</p>}
      <p className="px-3 pb-2 pt-1 text-[13px] text-muted">Пороги: 60 % — «3» или зачёт, 75 % — «4», 90 % — «5».</p>
    </Shell>
  );
}

function StudentHomework({ onNavigate }: { onNavigate?: () => void }) {
  const w = useWidget("student.homework", {});
  const [open, setOpen] = useState<string | null>(null);
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  const tone = (s: string) => (s === "overdue" ? "bad" : s === "returned" ? "warn" : s === "submitted" ? "ok" : "muted");
  return (
    <Shell title="Домашние задания" right={<Link href="/homework" onClick={onNavigate} className="text-[13px] font-semibold text-muted hover:text-fg">Все →</Link>}>
      {d.items.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Всё сдано и принято.</p>
      ) : (
        <ul className="space-y-2">
          {d.items.map((h: any) => (
            <li key={h.id} className="rounded-2xl bg-surface-2/70 px-3.5 py-3 text-[15px]">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/homework/${h.id}`} onClick={onNavigate} className="font-medium hover:underline">
                    {h.title}
                  </Link>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {h.course} · до {h.due}
                  </div>
                </div>
                <span className={chip(tone(h.state))}>{h.label}</span>
              </div>
              {h.state !== "submitted" &&
                (open === h.id ? (
                  <InlineSubmit id={h.id} d={d} onDone={() => (setOpen(null), w.reload())} onCancel={() => setOpen(null)} />
                ) : (
                  <button type="button" onClick={() => setOpen(h.id)} className={`${btn} mt-2.5 border border-border bg-surface hover:border-ink`}>
                    <Upload size={14} /> {h.state === "returned" ? "Отправить исправленное" : "Сдать"}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function InlineSubmit({ id, d, onDone, onCancel }: { id: string; d: any; onDone: () => void; onCancel: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => {
    if (!files.length) return setError("Прикрепите файл");
    start(async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const r = await fetch(`/api/homework/${id}`, { method: "POST", body: fd }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r || !r.ok) return setError(j.error ?? "Не удалось отправить");
      onDone();
    });
  };
  return (
    <div className="mt-2 space-y-2">
      <FileInput files={files} onChange={(f) => (setFiles(f), setError(null))} accept={d.accept} max={d.maxFiles} maxMb={d.maxMb} label="Прикрепить файлы" />
      {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={send} className={`${btn} bg-ink text-ink-fg`}>
          {pending && <LoaderCircle size={14} className="animate-spin" />} Отправить преподавателю
        </button>
        <button type="button" onClick={onCancel} className={`${btn} text-muted hover:text-fg`}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function StudentAttendance() {
  const w = useWidget("student.attendance", {});
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  if (!d.total) return <Shell title="Посещаемость">Отметок пока нет.</Shell>;
  return (
    <Shell title="Посещаемость" right={<span className={chip(d.percent < 80 ? "bad" : "ok")}>{d.percent} %</span>}>
      <ul className="space-y-2">
        {d.courses.map((c: any) => {
          const pct = Math.round((c.present / c.total) * 100);
          return (
            <li key={c.name} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className={cn("shrink-0 tabular-nums", pct < 80 && c.total >= 3 && "font-semibold text-danger")}>
                  {pct} % <span className="font-normal text-muted">({c.present}/{c.total})</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {d.recent.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-2 text-xs text-muted">
          <div className="font-semibold">Последние пропуски</div>
          {d.recent.map((r: string) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}
    </Shell>
  );
}

function StudentRequests({ onNavigate }: { onNavigate?: () => void }) {
  const w = useWidget("student.requests", {});
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  return (
    <Shell title="Мои заявки" right={<Link href="/requests" onClick={onNavigate} className="text-[13px] font-semibold text-muted hover:text-fg">Все →</Link>}>
      {w.data.items.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Заявок пока нет.</p>
      ) : (
        <ul className="divide-y divide-border/50 px-2 text-[15px]">
          {w.data.items.map((r: any) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} onClick={onNavigate} className="flex items-center gap-3 py-3 hover:underline">
                <span className="min-w-0 flex-1 truncate">
                  №{r.number} {r.title}
                </span>
                <span className={chip(r.attention ? "warn" : r.done ? "ok" : "muted")}>{r.attention ? "нужно ответить" : r.status.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/* ---------------- преподаватель ---------------- */

function TeacherDay({ p }: { p: Record<string, string> }) {
  const w = useWidget("teacher.day", p);
  const [marking, setMarking] = useState<string | null>(null);
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  return (
    <Shell title={d.title} right={<DayNav d={d} go={(date) => (setMarking(null), w.setParams({ date }))} />}>
      {d.lessons.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Пар нет.</p>
      ) : (
        <ul className="space-y-2">
          {d.lessons.map((l: any) => (
            <li key={l.id} className={cn("rounded-2xl bg-surface-2/70 px-3.5 py-3 text-[15px]", l.status === "CANCELLED" && "opacity-60")}>
              <div className="flex gap-3">
                <div className="w-14 shrink-0 font-semibold tabular-nums">{l.start}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.course}</div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {l.group} · ауд. {l.room}
                  </div>
                  {l.status !== "SCHEDULED" && <div className="mt-1 text-[13px] font-medium text-warning">{l.status === "CANCELLED" ? "Отменена" : "Перенесена"}{l.note ? `: ${l.note}` : ""}</div>}
                </div>
                {l.canMark && marking !== l.id && (
                  <button type="button" onClick={() => setMarking(l.id)} className={`${btn} shrink-0 border border-border hover:border-ink`}>
                    {l.marked ? "Отметки" : "Отметить"}
                  </button>
                )}
              </div>
              {marking === l.id && <TeacherAttendance lessonId={l.id} embedded onClose={() => (setMarking(null), w.reload())} />}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function TeacherAttendance({ lessonId, phrase, embedded, onClose }: { lessonId: string; phrase?: string; embedded?: boolean; onClose?: () => void }) {
  const w = useWidget("teacher.attendance", { lessonId });
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  const body = d.cancelled ? (
    <p className="px-2 py-3 text-[15px] text-muted">Пара отменена — отмечать не нужно.</p>
  ) : !d.canMark ? (
    <p className="px-2 py-3 text-[15px] text-muted">Будущую пару отметить нельзя.</p>
  ) : (
    <AttendanceForm lessonId={d.lessonId} students={d.students} marked={d.marked} save={saveAttendanceAction} recognize={recognizeAbsenceAction} initialText={phrase} />
  );
  if (embedded)
    return (
      <div className="mt-2 rounded-xl bg-surface p-2">
        {body}
        <button type="button" onClick={onClose} className="mt-2 text-[13px] font-semibold text-muted hover:text-fg">
          Свернуть
        </button>
      </div>
    );
  return (
    <Shell title={d.title} right={<span className="mt-0.5 text-[13px] text-muted">{d.when}</span>}>
      {body}
    </Shell>
  );
}

function TeacherReviews() {
  const w = useWidget("teacher.reviews", {});
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  return (
    <Shell title="На проверке">
      {w.data.items.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Всё проверено.</p>
      ) : (
        <ul className="space-y-2">
          {w.data.items.map((s: any) => (
            <ReviewItem key={s.id} s={s} onDone={w.reload} />
          ))}
        </ul>
      )}
    </Shell>
  );
}

function ReviewItem({ s, onDone }: { s: any; onDone: () => void }) {
  const [mode, setMode] = useState<"idle" | "return">("idle");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (status: "ACCEPTED" | "RETURNED") =>
    start(async () => {
      const r = await reviewAction(s.id, s.version, status, comment);
      if (r.error) setError(r.error);
      else onDone();
    });
  return (
    <li className="rounded-2xl bg-surface-2/70 px-3.5 py-3 text-[15px]">
      <div className="font-medium">{s.student}</div>
      <div className="mt-0.5 text-[13px] text-muted">
        «{s.assignment}», {s.group} · {s.when}
        {s.late && <span className="ml-1 font-semibold text-warning">после срока</span>}
      </div>
      {s.comment && <p className="mt-1 text-xs">«{s.comment}»</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {s.files.map((f: any) => (
          <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs">
            <Paperclip size={12} className="shrink-0" /> <span className="truncate">{f.name}</span>
          </a>
        ))}
      </div>
      {mode === "return" ? (
        <div className="mt-2 space-y-2">
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={1000} placeholder="Что исправить — студент увидит" className="w-full rounded-xl bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink/30" />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run("RETURNED")} className={`${btn} bg-warning text-white`}>
              <RotateCcw size={14} /> Вернуть
            </button>
            <button type="button" onClick={() => setMode("idle")} className={`${btn} text-muted`}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={pending} onClick={() => run("ACCEPTED")} className={`${btn} border border-border bg-surface hover:border-ink`}>
            {pending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Принять
          </button>
          <button type="button" onClick={() => setMode("return")} className={`${btn} border border-border hover:border-ink`}>
            <RotateCcw size={14} /> На доработку
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </li>
  );
}

/* ---------------- деканат ---------------- */

const INBOX_TABS = [
  { key: "NEW", label: "Новые" },
  { key: "IN_REVIEW", label: "В работе" },
  { key: "READY", label: "Готовы" },
];

function StaffInbox({ p, onNavigate }: { p: Record<string, string>; onNavigate?: () => void }) {
  const w = useWidget("staff.inbox", p);
  const [pending, start] = useTransition();
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  return (
    <Shell
      title={
        <div className="flex gap-1">
          {INBOX_TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => w.setParams({ status: t.key })} className={cn("min-h-9 rounded-full px-3 text-[13px] font-semibold", d.status === t.key ? "bg-ink text-ink-fg" : "text-muted hover:text-fg")}>
              {t.label}
            </button>
          ))}
        </div>
      }
      right={<Link href="/staff" onClick={onNavigate} className="shrink-0 text-[13px] font-semibold text-muted hover:text-fg">Все →</Link>}
    >
      {d.items.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Пусто.</p>
      ) : (
        <ul className="divide-y divide-border/50 px-2 text-[15px]">
          {d.items.map((r: any) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <Link href={`/staff/requests/${r.id}`} onClick={onNavigate} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-medium">
                  №{r.number} {r.title}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-muted">
                  {r.student}, {r.group} · {r.when}
                </span>
              </Link>
              {r.action && (
                <button type="button" disabled={pending} onClick={() => start(async () => (await quickStatusAction(r.id, r.action.to), w.reload()))} className={`${btn} shrink-0 border border-border hover:border-ink`}>
                  {r.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function StaffGroupDay({ p, ask }: { p: Record<string, string>; ask: Ask }) {
  const w = useWidget("staff.groupday", p);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const d = w.data;
  const ddmm = d.date.split("-").reverse().slice(0, 2).join(".");
  return (
    <Shell title={`${d.group} · ${d.title}`} right={<DayNav d={d} go={(date) => w.setParams({ groupId: d.groupId, date })} />}>
      {d.lessons.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Пар нет.</p>
      ) : (
        <ul className="space-y-2">
          {d.lessons.map((l: any) => (
            <li key={l.id} className={cn("rounded-2xl bg-surface-2/70 px-3.5 py-3 text-[15px]", l.status === "CANCELLED" && "opacity-60")}>
              <div className="flex gap-3">
                <div className="w-14 shrink-0 font-semibold tabular-nums">{l.start}</div>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-medium", l.status === "CANCELLED" && "line-through")}>{l.course}{l.subgroup ? ` (${l.subgroup} подгр.)` : ""}</div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    ауд. {l.room} · {l.teacher}
                  </div>
                  {l.status !== "SCHEDULED" && <div className="mt-1 text-[13px] font-medium text-warning">{l.status === "CANCELLED" ? "Отменена" : "Перенесена"}{l.note ? `: ${l.note}` : ""}</div>}
                </div>
              </div>
              {d.future && l.status !== "CANCELLED" && cancelling !== l.id && (
                <div className="ml-[68px] mt-2.5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => ask(`Перенеси пару ${d.group} по ${l.course.toLowerCase()} с ${ddmm} на `, "move", `Перенести: ${l.course}, ${l.start}`)} className={`${btn} border border-border hover:border-ink`}>
                    Перенести
                  </button>
                  <button type="button" onClick={() => (setCancelling(l.id), setReason(""), setError(null))} className={`${btn} text-danger hover:bg-danger-soft`}>
                    <X size={14} /> Отменить
                  </button>
                </div>
              )}
              {cancelling === l.id && (
                <div className="ml-[68px] mt-2.5 space-y-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Причина — её увидят студенты" className="min-h-9 w-full rounded-xl bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-ink/30" />
                  {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await cancelFromChatAction(l.id, reason);
                          if (r.error) return setError(r.error);
                          setCancelling(null);
                          w.reload();
                        })
                      }
                      className={`${btn} bg-danger text-white`}
                    >
                      {pending && <LoaderCircle size={14} className="animate-spin" />} Отменить пару
                    </button>
                    <button type="button" onClick={() => setCancelling(null)} className={`${btn} text-muted`}>
                      Не отменять
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function StaffPhotos({ onNavigate }: { onNavigate?: () => void }) {
  const w = useWidget("staff.photos", {});
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  return (
    <Shell title="Фото на проверке" right={<Link href="/staff/students/photos" onClick={onNavigate} className="text-[13px] font-semibold text-muted hover:text-fg">Все →</Link>}>
      {w.data.items.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Всё проверено.</p>
      ) : (
        <ul className="space-y-3">
          {w.data.items.map((x: any) => (
            <PhotoItem key={x.id} x={x} onDone={w.reload} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </Shell>
  );
}

const REASONS = ["Фон не однотонный", "Лицо мелко", "Головной убор или очки", "Нечёткое фото"];
function PhotoItem({ x, onDone, onNavigate }: { x: any; onDone: () => void; onNavigate?: () => void }) {
  const [reject, setReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (decision: "APPROVED" | "REJECTED", comment = "") =>
    start(async () => {
      const r = await reviewPhotoAction(x.id, decision, comment);
      if (r.error) setError(r.error);
      else onDone();
    });
  return (
    <li className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- защищённый маршрут */}
      <img src={`/api/photos/${x.id}`} alt="" width={60} height={80} className="h-20 w-[60px] shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1 text-[15px]">
        <Link href={`/staff/students/${x.studentId}`} onClick={onNavigate} className="font-medium hover:underline">
          {x.student}
        </Link>
        <div className="mt-0.5 text-[13px] text-muted">
          {x.group}
          {x.replaces ? " · заменит действующее" : ""}
        </div>
        {reject ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {REASONS.map((r) => (
              <button key={r} type="button" disabled={pending} onClick={() => act("REJECTED", r)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-ink">
                {r}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-1.5 flex gap-2">
            <button type="button" disabled={pending} onClick={() => act("APPROVED")} className={`${btn} border border-border bg-surface hover:border-ink`}>
              <Check size={14} /> Принять
            </button>
            <button type="button" onClick={() => setReject(true)} className={`${btn} border border-border hover:border-ink`}>
              Не подходит
            </button>
          </div>
        )}
        {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
      </div>
    </li>
  );
}

function StaffAccounts({ p, onNavigate }: { p: Record<string, string>; onNavigate?: () => void }) {
  const w = useWidget("staff.accounts", p);
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  const s = w.data.stats;
  const q = w.data.groupId ? `&group=${w.data.groupId}` : "";
  const tiles = [
    { label: "заходили за 7 дней", v: s.active7 },
    { label: "ни разу не входили", v: s.never, f: "never", bad: s.never > 0 },
    { label: "не заходили 14 дней", v: s.inactive, f: "inactive", bad: s.inactive > 0 },
    { label: "заблокированы", v: s.blocked, f: "blocked" },
  ];
  return (
    <Shell title={`Аккаунты · ${s.total} студ.`} right={<Link href="/staff/students/accounts" onClick={onNavigate} className="text-[13px] font-semibold text-muted hover:text-fg">Все →</Link>}>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <Link key={t.label} href={t.f ? `/staff/students/accounts?f=${t.f}${q}` : "/staff/students/accounts"} onClick={onNavigate} className="rounded-xl bg-surface-2 p-2 hover:ring-1 hover:ring-border">
            <div className={cn("font-head text-xl font-semibold tabular-nums", t.bad && "text-danger")}>{t.v}</div>
            <div className="mt-0.5 text-[13px] leading-snug text-muted">{t.label}</div>
          </Link>
        ))}
      </div>
      {w.data.never.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-xs font-semibold text-muted">Ни разу не входили</div>
          <div className="flex flex-wrap gap-1.5">
            {w.data.never.map((r: any) => (
              <Link key={r.id} href={`/staff/students/${r.id}`} onClick={onNavigate} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:border-ink">
                {r.name}, {r.group} <ArrowUpRight size={12} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ---------------- сводка «на сегодня» и напоминания ---------------- */

/** Строка сводки: что и сколько, по нажатию — нужная функция помощника или раздел. */
function TodayRow({ label, value, tone = "muted", onClick, href, onNavigate }: { label: React.ReactNode; value?: React.ReactNode; tone?: "muted" | "bad" | "warn"; onClick?: () => void; href?: string; onNavigate?: () => void }) {
  const cls = "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] transition hover:bg-surface-2";
  const body = (
    <>
      <span className="min-w-0 flex-1">{label}</span>
      {value != null && <span className={cn("shrink-0 font-semibold tabular-nums", tone === "bad" && "text-danger", tone === "warn" && "text-warning")}>{value}</span>}
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </>
  );
  if (href)
    return (
      <Link href={href} onClick={onNavigate} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function Reminders({ items }: { items: { text: string; when: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="mx-1 mb-1 mt-1 space-y-1 rounded-2xl bg-p-yellow/60 px-3 py-2.5 text-[15px] text-[#0e0e10]">
      {items.map((r) => (
        <div key={r.text + r.when} className="flex items-start gap-2">
          <Bell size={15} className="mt-1 shrink-0" />
          <span>
            {r.text} <span className="text-[13px] opacity-70">· {r.when}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function TodayWidget({ role, ask, onNavigate }: { role: "STUDENT" | "TEACHER" | "STAFF"; ask: Ask; onNavigate?: () => void }) {
  const type = role === "STUDENT" ? "student.today" : role === "TEACHER" ? "teacher.today" : "staff.today";
  const w = useWidget(type, {});
  if (w.error) return null;
  if (!w.data) return <Loading />;
  const d = w.data;
  return (
    <Shell title={`Сегодня · ${d.title}`}>
      <Reminders items={d.reminders ?? []} />
      {role === "STUDENT" && (
        <>
          {d.lessons.length ? (
            <div className="px-3 pb-1 pt-1 text-[15px]">
              {d.lessons.map((l: any) => (
                <div key={l.id} className={cn("flex gap-3 py-1", (l.past || l.status === "CANCELLED") && "text-muted", l.status === "CANCELLED" && "line-through")}>
                  <span className="w-12 shrink-0 font-semibold tabular-nums">{l.start}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.course} <span className="text-[13px] text-muted">· {l.room}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-[15px] text-muted">Пар сегодня нет.</p>
          )}
          {d.homework.map((h: any) => (
            <TodayRow
              key={h.id}
              label={
                <span className="block truncate">
                  Сдать «{h.title}» <span className="text-[13px] text-muted">· до {h.due}</span>
                </span>
              }
              value={h.label}
              tone={h.state === "overdue" ? "bad" : h.state === "returned" ? "warn" : "muted"}
              onClick={() => ask(`Сдай «${h.title}»`, "submit", `Сдать «${h.title}»`)}
            />
          ))}
          {d.needInfo.map((r: any) => (
            <TodayRow key={r.id} label={`Ответить деканату: ${r.title}`} tone="warn" value="ждут ответа" href={`/requests/${r.id}`} onNavigate={onNavigate} />
          ))}
          {d.unread > 0 && <TodayRow label="Непрочитанные сообщения" value={d.unread} href="/messages" onNavigate={onNavigate} />}
          {!d.homework.length && !d.needInfo.length && !d.unread && <p className="px-3 pb-2 text-[15px] text-muted">Срочных дел нет.</p>}
        </>
      )}
      {role === "TEACHER" && (
        <>
          {d.lessons.length ? (
            d.lessons.map((l: any) => (
              <TodayRow
                key={l.id}
                label={
                  <span className={cn("block truncate", l.status === "CANCELLED" && "text-muted line-through")}>
                    <b className="font-semibold tabular-nums">{l.start}</b> {l.course} <span className="text-[13px] text-muted">· {l.group} · {l.room}</span>
                  </span>
                }
                value={l.status === "CANCELLED" ? "отменена" : l.marked ? "отмечено" : l.started ? "отметить" : undefined}
                tone={!l.marked && l.started && l.status !== "CANCELLED" ? "warn" : "muted"}
                onClick={() => ask(`Отметь посещаемость: ${l.course}, ${l.group}`, "mark", `Отметить: ${l.course}, ${l.group}`)}
              />
            ))
          ) : (
            <p className="px-3 py-2 text-[15px] text-muted">Пар сегодня нет.</p>
          )}
          <TodayRow label="Работы на проверке" value={d.pending} tone={d.pending ? "warn" : "muted"} onClick={() => ask("Что ждёт проверки?", "reviews", "Работы на проверке")} />
          {d.unread > 0 && <TodayRow label="Непрочитанные сообщения" value={d.unread} href="/teacher/messages" onNavigate={onNavigate} />}
        </>
      )}
      {role === "STAFF" && (
        <>
          <TodayRow
            label={
              <>
                Новые заявки{d.overdue ? <span className="text-[13px] text-danger"> · просрочено {d.overdue}</span> : null}
              </>
            }
            value={d.fresh}
            tone={d.fresh ? "warn" : "muted"}
            onClick={() => ask("Покажи входящие", "inbox", "Новые заявки")}
          />
          <TodayRow label="В работе" value={d.inWork} onClick={() => ask("Что в работе?", "inbox", "Заявки в работе")} />
          {d.needInfo > 0 && <TodayRow label="Ждут ответа студента" value={d.needInfo} href="/staff?tab=wait" onNavigate={onNavigate} />}
          {d.photos > 0 && <TodayRow label="Фото на проверке" value={d.photos} tone="warn" onClick={() => ask("Фото на проверке", "photos", "Фото на проверке")} />}
          {d.unread > 0 && <TodayRow label="Обращения без ответа" value={d.unread} tone="warn" href="/staff/messages" onNavigate={onNavigate} />}
          {d.changes > 0 && <TodayRow label="Изменения в расписании сегодня" value={d.changes} href="/staff/schedule" onNavigate={onNavigate} />}
        </>
      )}
    </Shell>
  );
}

function RemindersList() {
  const w = useWidget("any.reminders", {});
  const [pending, start] = useTransition();
  if (w.error) return <Failed />;
  if (!w.data) return <Loading />;
  return (
    <Shell title="Мои напоминания">
      {w.data.items.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-muted">Напоминаний нет.</p>
      ) : (
        <ul className="divide-y divide-border/50 px-2 text-[15px]">
          {w.data.items.map((r: any) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                {r.text}
                <span className="mt-0.5 block text-[13px] text-muted">{r.when}</span>
              </span>
              <button type="button" disabled={pending} onClick={() => start(async () => (await deleteReminderAction(r.id), w.reload()))} aria-label="Удалить напоминание" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-danger">
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
