import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { currentSemester, getAttendance, getEnrollments, getExams, listRequests, summarize } from "@/server/repos/student";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { assessmentLabel, gradeText } from "@/lib/labels";
import { cn, fmtDateTime, plural, roomLabel } from "@/lib/utils";
import { listHomework, materialCounts } from "@/server/repos/homework";
import { hwState } from "@/lib/homework";

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

/** Прогноз по баллам на сегодня. Это не выставленная оценка: подпись «прогноз» и нейтральный цвет; зелёный — только у итога. */
function forecast(points: number, max: number, ratio: number, credit: boolean) {
  const steps = credit ? [{ at: 0.6, grade: "зачёт" }] : STEPS;
  const reached = [...steps].reverse().find((x) => ratio >= x.at);
  const next = steps.find((x) => ratio < x.at);
  const need = next ? Math.max(1, Math.ceil(next.at * max - points)) : 0;
  const balls = (n: number) => `${n} ${plural(n, "балл", "балла", "баллов")}`;
  const value = reached ? (reached.grade === "зачёт" ? "зачёт" : reached.grade) : credit ? "нет зачёта" : "ниже 3";
  const hint = !next ? (credit ? "Зачёт по баллам набран" : "Высший порог набран — держите темп") : `До ${next.grade === "зачёт" ? "зачёта" : `«${next.grade}»`} — ${balls(need)}`;
  return { value, hint, low: !reached, steps };
}

type Row = ReturnType<typeof summarize>["current"][number];

function DisciplineCard({ row, materials }: { row: Row; materials: number }) {
  const { enrollment: e, points, max, ratio, final } = row;
  const f = forecast(points, max, ratio, e.course.assessment === "CREDIT");
  const last = e.grades[e.grades.length - 1];
  const finalText = final ? (final.value === "PASS" ? "зачтено" : final.value === "FAIL" ? "не зачтено" : final.value) : null;
  return (
    <Card className="flex flex-col p-5">
      <div className="min-w-0">
        <div className="font-bold leading-snug">{e.course.name}</div>
        <div className="mt-0.5 text-xs text-muted">{assessmentLabel[e.course.assessment]}</div>
      </div>

      {/* главный результат: итог (если выставлен) или прогноз; рядом — баллы на сегодня */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{final ? (final.note?.startsWith("Перезачёт") ? "Перезачтено" : "Итог") : "Прогноз"}</div>
          <div className={cn("font-head font-semibold leading-none", final ? "text-success" : f.low ? "text-warning" : "text-fg", (finalText ?? f.value).length > 2 ? "mt-1.5 text-xl" : "mt-1 text-4xl")}>{finalText ?? f.value}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="leading-none tabular-nums">
            <span className="text-xl font-bold">{points}</span>
            <span className="text-sm text-muted"> из {max}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted">баллов на сегодня</div>
        </div>
      </div>

      {!final && (
        <>
          <div className="relative mt-3 h-1.5 rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={points} aria-label={`Баллы: ${points} из ${max}`}>
            <div className={cn("h-full rounded-full", f.low ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
            {f.steps.map((x) => (
              <span key={x.grade} title={x.grade === "зачёт" ? "зачёт" : `«${x.grade}»`} className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-fg/20" style={{ left: `${x.at * 100}%` }} aria-hidden />
            ))}
          </div>
          <p className={cn("mt-2 text-sm font-medium", f.low ? "text-warning" : "text-fg")}>{f.hint}</p>
        </>
      )}

      {/* подробности — одним раскрытием: последняя и все работы, материалы */}
      <details className="group mt-auto pt-3">
        <summary className="-mx-1 mt-1 flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border-t border-border/60 px-1 pt-2 text-sm text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate">
            {last ? (
              <>
                Последняя: <b className="font-semibold text-fg tabular-nums">{last.points ?? last.value}</b>
                {last.points != null && "/20"} · {fmtDayMonth(last.date)}
              </>
            ) : (
              "Оценок пока нет"
            )}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold">
            Подробнее <ChevronDown size={14} className="transition group-open:rotate-180" />
          </span>
        </summary>
        {e.grades.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {e.grades.map((g) => (
              <li key={g.id} className="flex justify-between gap-3">
                <span className="min-w-0 text-muted">
                  {fmtDayMonth(g.date)} · {g.note ?? "Оценка"}
                </span>
                <span className="shrink-0 tabular-nums">
                  <b className="font-semibold">{g.points ?? g.value}</b>
                  {g.points != null && <span className="text-muted">/20</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/courses/${e.course.id}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold hover:underline">
          Материалы{materials ? ` (${materials})` : ""} и задания <ChevronRight size={15} />
        </Link>
      </details>
    </Card>
  );
}

const TZ = "Europe/Moscow";
const dayNum = new Intl.DateTimeFormat("ru-RU", { day: "numeric", timeZone: TZ });
const monthShort = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: TZ });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: TZ });
const timeOnly = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

type Enr = Awaited<ReturnType<typeof getEnrollments>>[number];
const finalOf = (e: Enr) => [...e.grades].reverse().find((g) => g.kind === "FINAL" || g.kind === "RETAKE");

/**
 * Прошлый семестр: спокойный список в одну колонку. Цвет — только у проблем (долг),
 * обычные оценки — просто цифрой, без цветных плашек. Долги — наверху.
 */
function PastSemester({ rows, sem }: { rows: Enr[]; sem: number }) {
  const items = rows
    .map((e) => ({ e, v: finalOf(e)?.value ?? null }))
    .sort((a, b) => Number(b.v === "2" || b.v === "FAIL") - Number(a.v === "2" || a.v === "FAIL") || a.e.course.name.localeCompare(b.e.course.name, "ru"));
  const nums = items.map((i) => Number(i.v)).filter((n) => n >= 3);
  const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2).replace(".", ",") : null;
  const debts = items.filter((i) => i.v === "2" || i.v === "FAIL").length;
  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-sm text-muted">
        {/* период — видимой подписью: верхняя сводка — за всё время, здесь — только выбранный семестр */}
        <span className="font-semibold text-fg">Итоги {sem}-го семестра</span>
        {avg && (
          <>
            {" "}· средний балл <b className="font-semibold text-fg">{avg}</b>
          </>
        )}
        {debts > 0 && <span className="font-semibold text-danger"> · {debts} {plural(debts, "долг", "долга", "долгов")}</span>}
        {!debts && avg && " · без долгов"}
      </p>
      <ul className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
        {items.map(({ e, v }, i) => {
          const bad = v === "2" || v === "FAIL";
          return (
            <li key={e.id} className={cn("flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5", i > 0 && "border-t border-border/60", bad && "bg-danger-soft/60")}>
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{e.course.name}</div>
                <div className={cn("text-sm", bad ? "font-medium text-danger" : "text-muted")}>{bad ? "Долг — нужна пересдача" : assessmentLabel[e.course.assessment]}</div>
              </div>
              <div className="shrink-0 text-right">
                {v && /^\d$/.test(v) ? (
                  <>
                    <div className={cn("font-head text-2xl font-semibold leading-none tabular-nums", bad && "text-danger")}>{v}</div>
                    <div className="mt-1 text-[11px] text-muted">{gradeText(v).toLowerCase()}</div>
                  </>
                ) : (
                  <div className={cn("text-sm font-medium", bad ? "text-danger" : "text-muted")}>{v ? gradeText(v) : "—"}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


export default async function GradesPage({ searchParams }: { searchParams: Promise<{ sem?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const [enrollments, exams, requests, attendance, homework, matCount] = await Promise.all([getEnrollments(student), getExams(student), listRequests(student), getAttendance(student), listHomework(student), materialCounts(student)]);
  // актуальные задания: сначала «на доработку», потом по сроку
  const hwActive = homework.filter((h) => h.state !== "accepted").sort((a, b) => Number(b.state === "returned") - Number(a.state === "returned") || a.dueAt.getTime() - b.dueAt.getTime());
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
      <div className={cn("rounded-[32px]", status === "success" ? "p-4 sm:p-6" : "p-6 sm:p-8", status === "success" ? "bg-success-soft" : status === "warning" ? "bg-warning-soft" : "bg-danger-soft")}>
        <div className={cn("flex items-center gap-2 font-extrabold", status === "success" ? "text-success" : status === "warning" ? "text-warning" : "text-danger")}>
          {status === "success" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          {statusText.title}
        </div>
        {/* в спокойном состоянии заголовка достаточно — пояснение только когда есть что делать */}
        {status !== "success" && <p className="mt-1 text-sm">{statusText.text}</p>}
        <div className={cn("grid grid-cols-3 gap-2 text-center", status === "success" ? "mt-3" : "mt-4")}>
          <div className={cn("rounded-2xl bg-surface", status === "success" ? "p-2.5" : "p-3")} title="Средний балл итоговых оценок за всё время учёбы">
            <div className="text-2xl font-extrabold tabular-nums">{avg ? avg.toFixed(2).replace(".", ",") : "—"}</div>
            <div className="text-[11px] font-semibold text-muted">средний за всё время</div>
          </div>
          <div className={cn("rounded-2xl bg-surface", status === "success" ? "p-2.5" : "p-3")}>
            <div className={cn("text-2xl font-extrabold tabular-nums", debts.length && "text-danger")}>{debts.length}</div>
            <div className="text-[11px] font-semibold text-muted">{plural(debts.length, "долг", "долга", "долгов")}</div>
          </div>
          <div className={cn("rounded-2xl bg-surface", status === "success" ? "p-2.5" : "p-3")}>
            <div className="text-2xl font-extrabold tabular-nums">{daysToSession ?? "—"}</div>
            <div className="text-[11px] font-semibold text-muted">дн до сессии</div>
          </div>
        </div>
        {debts.length > 0 && retakeRequest?.status === "NEED_INFO" && (
          <ButtonLink href={`/requests/${retakeRequest.id}`} variant="danger" className="mt-4 w-full">
            Ответить деканату по пересдаче
          </ButtonLink>
        )}
        {debts.length > 0 && retakeRequest && retakeRequest.status !== "NEED_INFO" && (
          <ButtonLink href={`/requests/${retakeRequest.id}`} variant="secondary" className="mt-4 w-full">
            Статус заявления на пересдачу
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

      {/* Оценки — сразу после сводки */}
      <SectionTitle>Дисциплины</SectionTitle>
      {/* семестров немного — переносим строкой, а не прячем за краем ленты */}
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {semesters.map((s) => (
          <Link key={s} href={`/grades?sem=${s}`} role="tab" aria-selected={s === sem} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", s === sem ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface text-muted hover:text-fg")}>
            {s} семестр{s === curSem ? " · сейчас" : ""}
          </Link>
        ))}
      </div>

      {sem === curSem ? (
        current.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {current.map((row) => (
              <DisciplineCard key={row.enrollment.id} row={row} materials={matCount[row.enrollment.course.id] ?? 0} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<BookOpen size={22} />} title="Оценок пока нет" text="Баллы появятся после первых контрольных точек." />
        )
      ) : (
        <PastSemester rows={enrollments.filter((e) => e.semester === sem)} sem={sem} />
      )}

      {/* Второстепенное — после оценок; на широком экране в две колонки */}
      <div className="mt-4 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        <div>
        {/* Домашние задания — 3 ближайших, остальные на отдельной странице */}
        {homework.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold">Домашние задания</h2>
              <Link href="/homework" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
                Все <ArrowRight size={15} />
              </Link>
            </div>
            {hwActive.length ? (
              <div className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
                {hwActive.slice(0, 3).map((h) => (
                  <Link key={h.id} href={`/homework/${h.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2/60 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-snug">{h.title}</div>
                      <div className="mt-0.5 text-sm text-muted">
                        {h.course.name} · до {fmtDateTime(h.dueAt)}
                      </div>
                      {/* на телефоне статус — под названием: название и срок получают всю ширину */}
                      <span className={cn("mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold sm:hidden", hwState[h.state].cls)}>{hwState[h.state].label}</span>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold max-sm:hidden", hwState[h.state].cls)}>{hwState[h.state].label}</span>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-[28px] border border-border/70 bg-surface px-4 py-3.5 text-sm text-muted sm:px-5">Все задания сданы и приняты.</p>
            )}
          </section>
        )}
  
        {/* Посещаемость — одной строкой, пропуски по нажатию */}
        {attendance.total > 0 && (
          <details className="group mt-4 rounded-[28px] border border-border/70 bg-surface px-4 py-3.5 sm:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="font-semibold">Посещаемость {attendance.percent}%</span>
                <span className={cn("ml-2 text-sm", attendance.percent! < 80 ? "font-medium text-warning" : "text-muted")}>
                  {attendance.absences.length ? `пропущено ${attendance.absences.length} ${plural(attendance.absences.length, "пара", "пары", "пар")} из ${attendance.total}` : "без пропусков"}
                </span>
              </span>
              {attendance.absences.length > 0 && (
                <span className="shrink-0 text-xs font-medium text-muted">
                  <span className="group-open:hidden">Пропуски</span>
                  <span className="hidden group-open:inline">Свернуть</span>
                </span>
              )}
            </summary>
            {attendance.absences.length > 0 && (
              <>
                <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-sm">
                  {attendance.absences.slice(0, 12).map((a, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{a.course.name}</span>
                      <span className="shrink-0 text-muted tabular-nums">
                        {fmtDayMonth(a.date)}, {a.startTime}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/attendance" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fg hover:underline">
                  Вся история посещаемости <ChevronRight size={15} />
                </Link>
                <p className="mt-2 text-xs text-muted">
                  Пропуск по уважительной причине?{" "}
                  <Link href="/requests/new?type=APP_ABSENCE" className="font-medium text-fg underline underline-offset-2">
                    Подать заявление
                  </Link>
                </p>
              </>
            )}
          </details>
        )}
  
          </div>
        <div>
        {/* Сессия */}
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <CalendarCheck size={17} /> Зимняя сессия
          </span>
        </SectionTitle>
        {session.length ? (
          // Одна колонка сверху вниз, как в календаре: дата слева — сразу видно, что за чем идёт
          <div className="max-w-3xl">
            {daysToSession != null && (
              <p className="mb-3 text-sm text-muted">
                Первое испытание через <b className="font-semibold text-fg">{daysToSession} {plural(daysToSession, "день", "дня", "дней")}</b> · всего {session.length}
              </p>
            )}
            <ol className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
              {session.map((e, i) => (
                <li key={e.id} className={cn("flex items-center gap-4 px-4 py-3.5 sm:px-5", i > 0 && "border-t border-border/60")}>
                  <div className="w-12 shrink-0 text-center leading-none">
                    <div className="font-head text-2xl font-semibold tabular-nums">{dayNum.format(e.date)}</div>
                    <div className="mt-1 text-[11px] font-medium text-muted">{monthShort.format(e.date).replace(".", "")}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{e.course.name}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      <span className={e.kind === "EXAM" ? "font-medium text-primary" : ""}>{e.kind === "EXAM" ? "Экзамен" : "Зачёт"}</span>
                      {" · "}
                      {weekday.format(e.date)}, {timeOnly.format(e.date)} · {roomLabel(e.room)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <EmptyState icon={<TrendingUp size={22} />} title="Расписание сессии пока не опубликовано" />
        )}
          </div>
      </div>

    </div>
  );
}
