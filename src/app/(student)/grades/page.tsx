import Link from "next/link";
import { AlertTriangle, BookOpen, CalendarCheck, CheckCircle2, MapPin, TrendingUp } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { currentSemester, getEnrollments, getExams, listRequests, summarize } from "@/server/repos/student";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { assessmentLabel, gradeText } from "@/lib/labels";
import { cn, fmtDateTime, plural, roomLabel } from "@/lib/utils";

export const metadata = { title: "Учёба" };

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });
const fmtDayMonth = (d: Date) => dayMonth.format(d);

/**
 * Пороги от набранного к возможному на сегодня: 60% — «3»/зачёт, 75% — «4», 90% — «5».
 * Под шкалой — одна понятная фраза: на что сейчас идёте и сколько баллов не хватает до следующей оценки.
 */
const STEPS = [
  { at: 0.6, grade: "3" },
  { at: 0.75, grade: "4" },
  { at: 0.9, grade: "5" },
] as const;

function ThresholdBar({ points, max, ratio, credit }: { points: number; max: number; ratio: number; credit: boolean }) {
  const steps = credit ? [{ at: 0.6, grade: "зачёт" }] : STEPS;
  const reached = [...steps].reverse().find((s) => ratio >= s.at);
  const nextStep = steps.find((s) => ratio < s.at);
  const need = nextStep ? Math.max(1, Math.ceil(nextStep.at * max - points)) : 0;
  const label = (g: string) => (g === "зачёт" ? "зачёта" : `«${g}»`);
  const text = credit
    ? reached
      ? "Зачёт по баллам набран — так держать"
      : `До зачёта не хватает ${need} ${plural(need, "балла", "баллов", "баллов")}`
    : !reached
      ? `Пока ниже «3»: до неё не хватает ${need} ${plural(need, "балла", "баллов", "баллов")}`
      : nextStep
        ? `Сейчас на «${reached.grade}». До ${label(nextStep.grade)} — ${need} ${plural(need, "балл", "балла", "баллов")}`
        : "Идёте на «5»";
  const tone = !reached ? "bg-warning" : reached.grade === "5" || reached.grade === "зачёт" ? "bg-success" : "bg-primary";
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={points} aria-label={`Баллы: ${points} из ${max}`}>
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
        {steps.map((s) => (
          <span key={s.grade} className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-fg/25" style={{ left: `${s.at * 100}%` }} aria-hidden />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-muted" aria-hidden>
        {steps.map((s) => (
          <span key={s.grade} className="absolute -translate-x-1/2" style={{ left: `${s.at * 100}%` }}>
            {s.grade === "зачёт" ? "зачёт" : s.grade}
          </span>
        ))}
      </div>
      <p className={cn("mt-1 text-sm font-medium", !reached ? "text-warning" : "text-fg")}>{text}</p>
    </div>
  );
}

const gradeTone = (v: string) => (v === "5" || v === "PASS" ? "success" : v === "4" ? "primary" : v === "3" ? "warning" : "danger") as "success" | "primary" | "warning" | "danger";

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ sem?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const [enrollments, exams, requests] = await Promise.all([getEnrollments(student), getExams(student), listRequests(student)]);
  // активное заявление на пересдачу — вместо «подать ещё одно» ведём к нему
  const retakeRequest = requests.find((r) => r.type.code === "APP_RETAKE" && !["DONE", "REJECTED"].includes(r.status));
  const curSem = currentSemester(student);
  const { avg, debts, current, risky } = summarize(enrollments, curSem);
  const semesters = [...new Set(enrollments.map((e) => e.semester))].sort((a, b) => b - a);
  const sem = Number(sp.sem) && semesters.includes(Number(sp.sem)) ? Number(sp.sem) : curSem;
  const now = new Date();
  const upcoming = exams.filter((e) => e.date > now);
  const retakes = upcoming.filter((e) => e.kind === "RETAKE");
  const session = upcoming.filter((e) => e.kind !== "RETAKE");
  const daysToSession = session[0] ? Math.ceil((session[0].date.getTime() - now.getTime()) / 86400000) : null;

  const status = debts.length ? "danger" : risky.length ? "warning" : "success";
  const statusText = {
    success: { title: "Всё идёт хорошо", text: "Долгов нет, по текущим дисциплинам баллы в норме." },
    warning: { title: "Есть на что обратить внимание", text: `${risky.length} ${plural(risky.length, "дисциплина", "дисциплины", "дисциплин")} с баллом ниже 60% — стоит подтянуть до сессии.` },
    danger: { title: `${debts.length} ${plural(debts.length, "академическая задолженность", "академические задолженности", "академических задолженностей")}`, text: "Сдайте пересдачу, чтобы сохранить стипендию и перейти на следующий курс." },
  }[status];

  return (
    <div className="w-full">
      <PageHeader title="Учёба" subtitle={`${student.course} курс · ${curSem} семестр`} />

      {/* Как у меня дела */}
      <div className={cn("rounded-[32px] p-6 sm:p-8", status === "success" ? "bg-success-soft" : status === "warning" ? "bg-warning-soft" : "bg-danger-soft")}>
        <div className={cn("flex items-center gap-2 font-extrabold", status === "success" ? "text-success" : status === "warning" ? "text-warning" : "text-danger")}>
          {status === "success" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          {statusText.title}
        </div>
        <p className="mt-1 text-sm">{statusText.text}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-surface p-3">
            <div className="text-2xl font-extrabold tabular-nums">{avg ? avg.toFixed(2).replace(".", ",") : "—"}</div>
            <div className="text-[11px] font-semibold text-muted">средний балл</div>
          </div>
          <div className="rounded-2xl bg-surface p-3">
            <div className={cn("text-2xl font-extrabold tabular-nums", debts.length && "text-danger")}>{debts.length}</div>
            <div className="text-[11px] font-semibold text-muted">{plural(debts.length, "долг", "долга", "долгов")}</div>
          </div>
          <div className="rounded-2xl bg-surface p-3">
            <div className="text-2xl font-extrabold tabular-nums">{daysToSession ?? "—"}</div>
            <div className="text-[11px] font-semibold text-muted">дн до сессии</div>
          </div>
        </div>
        {debts.length > 0 && retakeRequest?.status === "NEED_INFO" && (
          <ButtonLink href={`/requests/${retakeRequest.id}`} variant="danger" className="mt-4 w-full">
            Деканат ждёт ответа по заявлению — ответить
          </ButtonLink>
        )}
        {debts.length > 0 && retakeRequest && retakeRequest.status !== "NEED_INFO" && (
          <ButtonLink href={`/requests/${retakeRequest.id}`} variant="secondary" className="mt-4 w-full">
            Заявление на пересдачу уже подано — посмотреть статус
          </ButtonLink>
        )}
        {debts.length > 0 && !retakeRequest && retakes.length === 0 && (
          <ButtonLink href="/requests/new?type=APP_RETAKE" variant="danger" className="mt-4 w-full">
            Подать заявление на пересдачу
          </ButtonLink>
        )}
      </div>

      {retakes.length > 0 && (
        <>
          <SectionTitle>Пересдачи</SectionTitle>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {retakes.map((e) => (
              <Card key={e.id} className="border-danger/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">{e.course.name}</div>
                    <div className="mt-1 text-sm text-muted">{fmtDateTime(e.date)} · {roomLabel(e.room)} · {e.teacher}</div>
                  </div>
                  <Badge tone="danger">Пересдача</Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Семестры */}
      <SectionTitle>Дисциплины</SectionTitle>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] pb-1" role="tablist">
        {semesters.map((s) => (
          <Link key={s} href={`/grades?sem=${s}`} role="tab" aria-selected={s === sem} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", s === sem ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface text-muted hover:text-fg")}>
            {s} семестр{s === curSem ? " · сейчас" : ""}
          </Link>
        ))}
      </div>

      {sem === curSem ? (
        current.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {current.map(({ enrollment: e, points, max, ratio }) => (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold leading-snug">{e.course.name}</div>
                    <div className="text-xs text-muted">{assessmentLabel[e.course.assessment]}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold tabular-nums">
                      {points}
                      <span className="text-sm font-semibold text-muted">/{max}</span>
                    </div>
                  </div>
                </div>
                <ThresholdBar points={points} max={max} ratio={ratio} credit={e.course.assessment === "CREDIT"} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.grades.map((g) => (
                    <span key={g.id} className="rounded-lg bg-surface-2 px-2 py-0.5 text-xs" title={`${g.note ?? "Оценка"}, ${fmtDayMonth(g.date)}`}>
                      {g.note} · {fmtDayMonth(g.date)}: <b>{g.points ?? g.value}</b>
                      {g.points != null && <span className="text-muted">/20</span>}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<BookOpen size={22} />} title="Оценок пока нет" text="Баллы появятся после первых контрольных точек." />
        )
      ) : (
        <Card className="grid grid-cols-1 gap-px overflow-hidden bg-border p-0 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
          {enrollments
            .filter((e) => e.semester === sem)
            .map((e) => {
              const final = [...e.grades].reverse().find((g) => g.kind === "FINAL" || g.kind === "RETAKE");
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">{e.course.name}</div>
                    <div className="text-xs text-muted">{assessmentLabel[e.course.assessment]}</div>
                  </div>
                  {final ? <Badge tone={gradeTone(final.value)}>{gradeText(final.value)}{/^\d$/.test(final.value) ? ` · ${final.value}` : ""}</Badge> : <Badge>—</Badge>}
                </div>
              );
            })}
        </Card>
      )}

      {/* Сессия */}
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <CalendarCheck size={17} /> Зимняя сессия
        </span>
      </SectionTitle>
      {session.length ? (
        <Card className="grid grid-cols-1 gap-px overflow-hidden bg-border p-0 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
          {session.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{e.course.name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <MapPin size={12} /> {roomLabel(e.room)} · {e.teacher}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={e.kind === "EXAM" ? "primary" : "neutral"}>{e.kind === "EXAM" ? "Экзамен" : "Зачёт"}</Badge>
                <div className="mt-1 text-xs font-semibold">{fmtDateTime(e.date)}</div>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState icon={<TrendingUp size={22} />} title="Расписание сессии пока не опубликовано" />
      )}
    </div>
  );
}
