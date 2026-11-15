import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarRange, CheckCircle2, Clock, FilePlus2, GraduationCap, PartyPopper } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getEnrollments, getExams, getLessons, listDeadlines, listRequests, currentSemester, summarize } from "@/server/repos/student";
import { remindDeadlines } from "@/server/notify";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/ui";
import { addDays, fmtDateTime, fmtDay, fmtShort, isoDate, minutesOf, moscowTime, moscowToday, plural } from "@/lib/utils";
import { requestStatusLabel } from "@/lib/labels";
import { AttentionList, type AttentionItem } from "./attention-list";

export const metadata = { title: "Главная" };

function greeting(hhmm: string) {
  const h = Number(hhmm.slice(0, 2));
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

/** ISO-время начала занятия (МСК → UTC) */
const lessonStartIso = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h - 3, m)).toISOString();
};

export default async function TodayPage() {
  const { student } = await requireStudent();
  await remindDeadlines(student);

  const today = moscowToday();
  const nowHM = moscowTime();
  const nowMin = minutesOf(nowHM);

  const [lessons14, deadlines, requests, enrollments, exams] = await Promise.all([
    getLessons(student, today, addDays(today, 14)),
    listDeadlines(student, 7),
    listRequests(student),
    getEnrollments(student),
    getExams(student),
  ]);

  const todayLessons = lessons14.filter((l) => l.date.getTime() === today.getTime());
  const active = todayLessons.filter((l) => l.status !== "CANCELLED");
  const current = active.find((l) => minutesOf(l.startTime) <= nowMin && nowMin < minutesOf(l.endTime));
  const nextToday = active.find((l) => minutesOf(l.startTime) > nowMin);
  const nextLater = lessons14.find((l) => l.date > today && l.status !== "CANCELLED");
  const next = current ?? nextToday ?? nextLater;

  const weekChanges = lessons14.filter((l) => l.status !== "SCHEDULED" && l.date < addDays(today, 7)).length;
  const { debts } = summarize(enrollments, currentSemester(student));
  const retakes = exams.filter((e) => e.kind === "RETAKE" && e.date > new Date());
  const attentionRequests = requests.filter((r) => r.status === "NEED_INFO" || (r.status === "READY" && r.updatedAt > addDays(new Date(), -7)));

  type Item = AttentionItem;
  const items: Item[] = [];
  for (const r of attentionRequests)
    items.push({
      key: "r" + r.id,
      kind: r.status === "NEED_INFO" ? "need_info" : "ready",
      tone: r.status === "NEED_INFO" ? "bg-p-peach text-[#0e0e10]" : "bg-p-mint text-[#0e0e10]",
      title: r.status === "NEED_INFO" ? "Деканат ждёт ответа" : "Заявка готова",
      text: `${r.type.title} — ${requestStatusLabel[r.status].toLowerCase()}`,
      href: `/requests/${r.id}`,
    });
  for (const e of retakes)
    items.push({ key: "e" + e.id, kind: "retake", tone: "bg-danger-soft text-danger", title: `Пересдача: ${e.course.name}`, text: `${fmtDateTime(e.date)}, ауд. ${e.room}`, href: "/grades" });
  for (const d of deadlines)
    items.push({ key: "d" + d.id, kind: "deadline", tone: "bg-p-sky text-[#0e0e10]", title: d.title, text: `до ${fmtDateTime(d.dueAt)}`, href: d.link ?? "/notifications" });
  if (debts.length && !retakes.length)
    items.push({ key: "debt", kind: "debt", tone: "bg-danger-soft text-danger", title: `${debts.length} ${plural(debts.length, "долг", "долга", "долгов")}`, text: "Подайте заявление на пересдачу", href: "/requests/new?type=APP_RETAKE" });
  if (weekChanges)
    items.push({ key: "chg", kind: "changes", tone: "bg-p-yellow text-[#0e0e10]", title: `${weekChanges} ${plural(weekChanges, "изменение", "изменения", "изменений")} в расписании`, text: "В ближайшие 7 дней — переносы и отмены", href: "/schedule" });

  const lessonsWord = `${active.length} ${plural(active.length, "пара", "пары", "пар")}`;
  const itemsWord = `${items.length} ${plural(items.length, "дело", "дела", "дел")}`;

  const tiles = [
    { href: "/requests/new", label: "Заказать справку", hint: "PDF с QR за 1 день", icon: <FilePlus2 size={22} />, tone: "bg-p-mint" },
    { href: "/schedule", label: "Расписание", hint: "Пары и переносы", icon: <CalendarRange size={22} />, tone: "bg-p-sky" },
    { href: "/grades", label: "Оценки", hint: "Баллы и сессия", icon: <GraduationCap size={22} />, tone: "bg-p-lilac" },
  ];

  const restToday = todayLessons.filter((l) => l.status !== "CANCELLED" && l.id !== next?.id).length;

  return (
    <div className="w-full">
      {/* ---------- Приветствие: одна фраза о главном ---------- */}
      <section className="pb-7 pt-2 lg:pb-9 lg:pt-6">
        <p className="text-sm font-medium text-muted sm:text-base">{fmtDay(today)}</p>
        <h1 className="mt-2 font-head text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl xl:text-6xl">
          {greeting(nowHM)}, {student.firstName}!
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-snug text-muted sm:text-xl">
          {active.length ? (
            <>
              Сегодня у вас <b className="font-semibold text-fg">{lessonsWord}</b>
            </>
          ) : (
            <>
              Сегодня <b className="font-semibold text-fg">пар нет</b>
            </>
          )}
          {items.length ? (
            <>
              {" "}и <b className="font-semibold text-fg">{itemsWord}</b> ждут внимания.
            </>
          ) : (
            <>
              {" "}— и <b className="font-semibold text-fg">всё спокойно</b>.
            </>
          )}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8">
        {/* Ближайшая пара */}
        {next ? (
          <Link href={`/schedule?date=${isoDate(next.date)}`} className="group relative flex min-h-[260px] flex-col overflow-hidden rounded-[32px] bg-ink p-6 text-ink-fg sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-[radial-gradient(circle,rgba(255,230,138,0.28),transparent_65%)]" />
            <div className="relative flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-p-yellow px-3 py-1 text-[13px] font-semibold text-[#0e0e10]">
                <Clock size={14} />
                {current ? <>идёт · ещё {Math.max(0, minutesOf(current.endTime) - nowMin)} мин</> : <Countdown to={lessonStartIso(next.date, next.startTime)} />}
              </span>
              <span className="text-sm opacity-60">{current ? "Сейчас" : next.date.getTime() === today.getTime() ? "Следующая пара" : `Ближайшая пара · ${fmtShort(next.date)}`}</span>
            </div>
            <h2 className="relative mt-5 max-w-xl font-head text-3xl font-semibold leading-[1.08] tracking-[-0.02em] sm:text-4xl">{next.course.name}</h2>
            <p className="relative mt-3 text-[15px] opacity-75">
              {next.startTime}–{next.endTime} · {next.room}, {next.building}
            </p>
            {next.status === "MOVED" && <p className="relative mt-2 text-sm text-p-yellow">⚠ {next.changeNote}</p>}
            <div className="relative mt-auto flex items-end justify-between gap-3 pt-6">
              <span className="text-sm opacity-60">{restToday > 0 ? `Сегодня ещё ${restToday} ${plural(restToday, "пара", "пары", "пар")}` : "Всё расписание"}</span>
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white group-hover:text-[#0e0e10]">
                <ArrowRight size={22} />
              </span>
            </div>
          </Link>
        ) : (
          <EmptyState icon={<PartyPopper size={22} />} title="Пар в ближайшие две недели нет" text="Отдыхайте — или загляните в раздел «Учёба»." />
        )}

        {/* Дела: три главных, остальное по кнопке */}
        <section className="min-w-0">
          <h2 className="mb-3 font-head text-lg font-semibold tracking-tight sm:text-xl">Требует внимания</h2>
          {items.length ? (
            <AttentionList items={items.map(({ key, title, text, href, tone, kind }) => ({ key, title, text, href, tone, kind }))} />
          ) : (
            <div className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-5">
              <CheckCircle2 className="text-success" />
              <div>
                <div className="font-semibold">Всё спокойно</div>
                <div className="text-sm text-muted">Нет срочных дел и вопросов от деканата.</div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Быстрые действия */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:mt-8">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={`group flex items-center gap-4 rounded-[28px] p-5 text-[#0e0e10] transition hover:-translate-y-0.5 ${t.tone}`}>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/70">{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold leading-tight">{t.label}</span>
              <span className="mt-0.5 block text-[13px] opacity-65">{t.hint}</span>
            </span>
            <ArrowUpRight size={18} className="shrink-0 opacity-50 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}
