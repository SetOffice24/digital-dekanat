import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, FileCheck2, FileQuestion, Megaphone, PartyPopper, Sparkles, Clock } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getCheckin, getEnrollments, getExams, getLessons, listAnnouncements, listDeadlines, listRequests, currentSemester, summarize } from "@/server/repos/student";
import { remindDeadlines } from "@/server/notify";
import { LessonItem } from "@/components/lesson-item";
import { Countdown } from "@/components/countdown";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { addDays, fmtDateTime, fmtDay, fmtShort, isoDate, minutesOf, moscowTime, moscowToday, mondayOf, plural } from "@/lib/utils";
import { requestStatusLabel } from "@/lib/labels";
import { Checkin } from "./checkin";

export const metadata = { title: "Сегодня" };

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
  const weekStart = mondayOf(today);

  const [lessons14, deadlines, requests, announcements, enrollments, exams, checkin] = await Promise.all([
    getLessons(student, today, addDays(today, 14)),
    listDeadlines(student, 7),
    listRequests(student),
    listAnnouncements(student, 5),
    getEnrollments(student),
    getExams(student),
    getCheckin(student, weekStart),
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
  const pinned = announcements.find((a) => a.pinned);
  const weekLoad = deadlines.filter((d) => d.dueAt < addDays(weekStart, 7)).length + retakes.filter((e) => e.date < addDays(weekStart, 7)).length;

  type Item = { key: string; icon: React.ReactNode; tone: string; title: string; text: string; href: string };
  const items: Item[] = [];
  for (const r of attentionRequests)
    items.push({
      key: "r" + r.id,
      icon: r.status === "NEED_INFO" ? <FileQuestion size={20} /> : <FileCheck2 size={20} />,
      tone: r.status === "NEED_INFO" ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
      title: r.status === "NEED_INFO" ? "Деканат ждёт ответа" : "Заявка готова",
      text: `${r.type.title} — ${requestStatusLabel[r.status].toLowerCase()}`,
      href: `/requests/${r.id}`,
    });
  for (const e of retakes)
    items.push({ key: "e" + e.id, icon: <AlertTriangle size={20} />, tone: "bg-danger-soft text-danger", title: `Пересдача: ${e.course.name}`, text: `${fmtDateTime(e.date)}, ауд. ${e.room}`, href: "/grades" });
  for (const d of deadlines)
    items.push({ key: "d" + d.id, icon: <Clock size={20} />, tone: "bg-info-soft text-info", title: d.title, text: `до ${fmtDateTime(d.dueAt)}`, href: d.link ?? "/notifications" });
  if (debts.length && !retakes.length)
    items.push({ key: "debt", icon: <AlertTriangle size={20} />, tone: "bg-danger-soft text-danger", title: `${debts.length} ${plural(debts.length, "долг", "долга", "долгов")}`, text: "Подайте заявление на пересдачу", href: "/requests/new?type=APP_RETAKE" });
  if (weekChanges)
    items.push({ key: "chg", icon: <CalendarClock size={20} />, tone: "bg-warning-soft text-warning", title: `${weekChanges} ${plural(weekChanges, "изменение", "изменения", "изменений")} в расписании`, text: "В ближайшие 7 дней — переносы и отмены", href: "/schedule" });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <p className="text-sm font-medium text-muted">{fmtDay(today)}</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">
          {greeting(nowHM)}, {student.firstName}!
        </h1>
      </div>

      {/* Следующая пара */}
      {next ? (
        <Link href={`/schedule?date=${isoDate(next.date)}`} className="block">
          <div className="hero relative overflow-hidden rounded-[28px] p-5 text-[#1f1f24] shadow-[0_16px_40px_-18px_rgba(75,90,140,0.45)] dark:text-white">
            <div className="absolute -right-10 -top-12 size-44 rounded-full bg-white/25 blur-xl" />
            <div className="absolute -bottom-16 left-10 size-40 rounded-full bg-[#ffe3cc]/40 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-sm font-semibold opacity-75">
                <CalendarDays size={16} />
                {current ? "Идёт сейчас" : next.date.getTime() === today.getTime() ? "Следующая пара" : `Ближайшая пара · ${fmtShort(next.date)}`}
              </div>
              <div className="mt-2 font-display text-[19px] font-semibold leading-snug">{next.course.name}</div>
              <div className="mt-1.5 text-sm font-medium opacity-80">
                {next.startTime}–{next.endTime} · {next.room}, {next.building}
              </div>
              <div className="mt-0.5 text-sm opacity-70">{next.teacher.fullName}</div>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/55 px-3.5 py-1.5 text-sm font-bold backdrop-blur dark:bg-white/15">
                <Clock size={14} />
                {current ? <>до конца {Math.max(0, minutesOf(current.endTime) - nowMin)} мин</> : <Countdown to={lessonStartIso(next.date, next.startTime)} />}
              </div>
              {next.status === "MOVED" && <div className="mt-3 rounded-2xl bg-white/55 px-3.5 py-2 text-sm font-medium backdrop-blur dark:bg-white/15">⚠ {next.changeNote}</div>}
            </div>
          </div>
        </Link>
      ) : (
        <EmptyState icon={<PartyPopper size={22} />} title="Пар в ближайшие две недели нет" text="Отдыхайте — или загляните в раздел «Учёба»." />
      )}

      {/* Помощник */}
      <Link href="/assistant" className="mt-3 flex items-center gap-3 rounded-[22px] bg-ink p-3.5 text-ink-fg transition hover:opacity-95">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/12">
          <Sparkles size={20} className="text-accent-peach" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Спросить помощника</span>
          <span className="block truncate text-[13px] opacity-70">«Нужна справка в банк», «какие пары завтра?»</span>
        </span>
        <ChevronRight size={18} className="shrink-0 opacity-70" />
      </Link>

      {/* Требует внимания */}
      <SectionTitle>Требует внимания</SectionTitle>
      {items.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.slice(0, 6).map((it) => (
            <Link key={it.key} href={it.href} className="group flex items-center gap-3 rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(20,24,40,0.04)] ring-1 ring-border/70 p-3.5 transition hover:border-primary/40">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${it.tone}`}>{it.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{it.title}</span>
                <span className="block truncate text-[13px] text-muted">{it.text}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      ) : (
        <Card className="flex items-center gap-3">
          <CheckCircle2 className="text-success" />
          <div>
            <div className="font-bold">Всё спокойно</div>
            <div className="text-sm text-muted">Нет срочных дел и непрочитанных вопросов от деканата.</div>
          </div>
        </Card>
      )}

      {weekLoad >= 3 && (
        <div className="mt-3 flex gap-3 rounded-2xl bg-info-soft p-3.5 text-sm text-info">
          <Sparkles size={18} className="mt-0.5 shrink-0" />
          <p>
            <b>Плотная неделя:</b> {weekLoad} {plural(weekLoad, "дедлайн", "дедлайна", "дедлайнов")} и контрольных. Начните с ближайшего — и не забудьте про перерывы.
          </p>
        </div>
      )}

      {/* Пары сегодня */}
      <SectionTitle action={<Link href="/schedule" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">Неделя <ArrowRight size={15} /></Link>}>
        Пары сегодня {todayLessons.length > 0 && <span className="font-medium text-muted">· {active.length}</span>}
      </SectionTitle>
      {todayLessons.length ? (
        <div className="space-y-2">
          {todayLessons.map((l) => (
            <LessonItem key={l.id} lesson={l} highlight={current?.id === l.id ? "now" : undefined} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<PartyPopper size={22} />} title="Сегодня пар нет" text="Хороший день, чтобы закрыть дедлайны или отдохнуть." />
      )}

      {/* Объявление */}
      {pinned && (
        <>
          <SectionTitle action={<Link href="/notifications?tab=news" className="text-sm font-semibold text-primary">Все</Link>}>Деканат сообщает</SectionTitle>
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Megaphone size={20} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{pinned.title}</span>
                  <Badge tone="primary">Важно</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{pinned.body}</p>
              </div>
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Как вы на этой неделе?</SectionTitle>
      <Checkin initial={checkin?.mood ?? null} />
    </div>
  );
}
