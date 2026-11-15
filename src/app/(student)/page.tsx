import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, Clock, FileCheck2, FilePlus2, FileQuestion, GraduationCap, MapPin, Megaphone, PartyPopper, Sparkles, UserRound } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getCheckin, getEnrollments, getExams, getLessons, listAnnouncements, listDeadlines, listRequests, currentSemester, summarize } from "@/server/repos/student";
import { remindDeadlines } from "@/server/notify";
import { LessonItem } from "@/components/lesson-item";
import { Countdown } from "@/components/countdown";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { addDays, fmtDateTime, fmtDay, fmtShort, isoDate, minutesOf, moscowTime, moscowToday, mondayOf, plural } from "@/lib/utils";
import { requestStatusLabel } from "@/lib/labels";
import { Checkin } from "./checkin";
import { OpenAssistant } from "@/components/assistant/provider";
import { Mascot } from "@/components/assistant/mascot";

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
      tone: r.status === "NEED_INFO" ? "bg-p-peach text-[#0e0e10]" : "bg-p-mint text-[#0e0e10]",
      title: r.status === "NEED_INFO" ? "Деканат ждёт ответа" : "Заявка готова",
      text: `${r.type.title} — ${requestStatusLabel[r.status].toLowerCase()}`,
      href: `/requests/${r.id}`,
    });
  for (const e of retakes)
    items.push({ key: "e" + e.id, icon: <AlertTriangle size={20} />, tone: "bg-danger-soft text-danger", title: `Пересдача: ${e.course.name}`, text: `${fmtDateTime(e.date)}, ауд. ${e.room}`, href: "/grades" });
  for (const d of deadlines)
    items.push({ key: "d" + d.id, icon: <Clock size={20} />, tone: "bg-p-sky text-[#0e0e10]", title: d.title, text: `до ${fmtDateTime(d.dueAt)}`, href: d.link ?? "/notifications" });
  if (debts.length && !retakes.length)
    items.push({ key: "debt", icon: <AlertTriangle size={20} />, tone: "bg-danger-soft text-danger", title: `${debts.length} ${plural(debts.length, "долг", "долга", "долгов")}`, text: "Подайте заявление на пересдачу", href: "/requests/new?type=APP_RETAKE" });
  if (weekChanges)
    items.push({ key: "chg", icon: <CalendarClock size={20} />, tone: "bg-p-yellow text-[#0e0e10]", title: `${weekChanges} ${plural(weekChanges, "изменение", "изменения", "изменений")} в расписании`, text: "В ближайшие 7 дней — переносы и отмены", href: "/schedule" });

  const lessonsWord = `${active.length} ${plural(active.length, "пара", "пары", "пар")}`;
  const itemsWord = `${items.length} ${plural(items.length, "дело", "дела", "дел")}`;

  const tiles = [
    { href: "/requests/new", label: "Заказать справку", hint: "PDF с QR за 1 день", icon: <FilePlus2 size={22} />, tone: "bg-p-mint" },
    { href: "/schedule?view=week", label: "Неделя", hint: "Все пары и переносы", icon: <CalendarRange size={22} />, tone: "bg-p-sky" },
    { href: "/grades", label: "Оценки", hint: "Баллы и сессия", icon: <GraduationCap size={22} />, tone: "bg-p-lilac" },
  ];

  return (
    <div className="w-full">
      {/* ---------- Приветствие в стиле «Welcome [фото] again!» ---------- */}
      <section className="pb-6 pt-2 sm:pb-8 lg:pt-6">
        <p className="text-sm font-medium text-muted sm:text-base">{fmtDay(today)}</p>
        <h1 className="mt-2 font-head text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl xl:text-7xl">
          {greeting(nowHM)},{" "}
          <span className="inline-flex translate-y-[-0.08em] items-center rounded-full bg-p-yellow px-[0.28em] py-[0.04em] align-middle text-[0.62em]" aria-hidden>
            <Mascot size={44} className="size-[1.1em]" />
          </span>{" "}
          {student.firstName}!
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-snug text-muted sm:text-2xl">
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)] xl:gap-8">
        {/* ---------- Левая колонка ---------- */}
        <div className="min-w-0 space-y-5">
          {/* Следующая пара — тёмная «медиа»-карточка */}
          {next ? (
            <Link href={`/schedule?date=${isoDate(next.date)}`} className="group relative block overflow-hidden rounded-[32px] bg-ink p-6 text-ink-fg sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(255,230,138,0.35),transparent_65%)]" />
              <div className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-[radial-gradient(circle,rgba(221,211,255,0.25),transparent_65%)]" />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-p-yellow px-3 py-1 text-[13px] font-semibold text-[#0e0e10]">
                    <Clock size={14} />
                    {current ? <>идёт · до конца {Math.max(0, minutesOf(current.endTime) - nowMin)} мин</> : <Countdown to={lessonStartIso(next.date, next.startTime)} />}
                  </span>
                  <span className="text-sm opacity-60">{current ? "Сейчас" : next.date.getTime() === today.getTime() ? "Следующая пара" : `Ближайшая пара · ${fmtShort(next.date)}`}</span>
                </div>
                <h2 className="mt-5 max-w-xl font-head text-3xl font-semibold leading-[1.08] tracking-[-0.02em] sm:text-4xl">{next.course.name}</h2>
                <div className="mt-6 flex flex-wrap gap-2 pr-16">
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm">
                    <CalendarDays size={15} /> {next.startTime}–{next.endTime}
                  </span>
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm">
                    <MapPin size={15} /> {next.room}, {next.building}
                  </span>
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm">
                    <UserRound size={15} /> {next.teacher.fullName}
                  </span>
                </div>
                {next.status === "MOVED" && <p className="mt-4 text-sm text-p-yellow">⚠ {next.changeNote}</p>}
              </div>
              <span className="absolute bottom-6 right-6 flex size-14 items-center justify-center rounded-full bg-white/15 backdrop-blur transition group-hover:bg-white group-hover:text-[#0e0e10] sm:bottom-8 sm:right-8">
                <ArrowRight size={22} />
              </span>
            </Link>
          ) : (
            <EmptyState icon={<PartyPopper size={22} />} title="Пар в ближайшие две недели нет" text="Отдыхайте — или загляните в раздел «Учёба»." />
          )}

          {/* Быстрые действия — пастельные плитки */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.href} href={t.href} className={`group flex min-h-36 flex-col justify-between rounded-[28px] p-4 text-[#0e0e10] transition hover:-translate-y-0.5 sm:p-5 ${t.tone}`}>
                <span className="flex size-11 items-center justify-center rounded-full bg-white/70">{t.icon}</span>
                <span>
                  <span className="block text-[17px] font-semibold leading-tight">{t.label}</span>
                  <span className="mt-0.5 block text-[13px] opacity-65">{t.hint}</span>
                </span>
              </Link>
            ))}
            <OpenAssistant className="group flex min-h-36 flex-col justify-between rounded-[28px] bg-p-yellow p-4 text-left text-[#0e0e10] transition hover:-translate-y-0.5 sm:p-5">
              <span className="flex size-11 items-center justify-center rounded-full bg-white/70">
                <Mascot size={30} />
              </span>
              <span>
                <span className="block text-[17px] font-semibold leading-tight">Спросить Уни</span>
                <span className="mt-0.5 block text-[13px] opacity-65">Ответит 24/7</span>
              </span>
            </OpenAssistant>
          </div>

          {/* Пары сегодня */}
          <section>
            <SectionTitle action={<Link href="/schedule" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium hover:border-ink">Расписание <ArrowRight size={15} /></Link>}>
              Пары сегодня
            </SectionTitle>
            {todayLessons.length ? (
              <div className="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
                {todayLessons.map((l) => (
                  <LessonItem key={l.id} lesson={l} highlight={current?.id === l.id ? "now" : undefined} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-[28px] border border-border/70 bg-surface p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-p-mint text-[#0e0e10]">
                  <PartyPopper size={22} />
                </span>
                <div>
                  <div className="font-semibold">Сегодня пар нет</div>
                  <div className="text-sm text-muted">Хороший день, чтобы закрыть дедлайны или отдохнуть.</div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Правая колонка ---------- */}
        <div className="min-w-0 space-y-5">
          <section>
            <SectionTitle className="xl:mt-0">Требует внимания {items.length > 0 && <span className="ml-1 rounded-full bg-ink px-2 py-0.5 align-middle text-xs font-semibold text-ink-fg">{items.length}</span>}</SectionTitle>
            {items.length ? (
              <div className="space-y-2.5">
                {items.slice(0, 6).map((it) => (
                  <Link key={it.key} href={it.href} className="group flex items-center gap-3.5 rounded-[24px] border border-border/70 bg-surface p-3.5 pr-4 transition hover:border-ink/40">
                    <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${it.tone}`}>{it.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{it.title}</span>
                      <span className="block truncate text-[13px] text-muted">{it.text}</span>
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 transition group-hover:bg-ink group-hover:text-ink-fg">
                      <ArrowUpRight size={17} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="flex items-center gap-3">
                <CheckCircle2 className="text-success" />
                <div>
                  <div className="font-semibold">Всё спокойно</div>
                  <div className="text-sm text-muted">Нет срочных дел и вопросов от деканата.</div>
                </div>
              </Card>
            )}
            {weekLoad >= 3 && (
              <div className="mt-3 flex gap-3 rounded-[24px] bg-p-lilac p-4 text-sm text-[#0e0e10]">
                <Sparkles size={18} className="mt-0.5 shrink-0" />
                <p>
                  <b>Плотная неделя:</b> {weekLoad} {plural(weekLoad, "дедлайн", "дедлайна", "дедлайнов")} и контрольных. Начните с ближайшего — и не забудьте про перерывы.
                </p>
              </div>
            )}
          </section>

          {pinned && (
            <section>
              <SectionTitle action={<Link href="/notifications?tab=news" className="text-sm font-medium text-muted hover:text-fg">Все объявления</Link>}>Деканат сообщает</SectionTitle>
              <div className="rounded-[28px] border border-border/70 bg-surface p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-p-peach text-[#0e0e10]">
                    <Megaphone size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{pinned.author.fullName}</div>
                    <div className="text-xs text-muted">{pinned.author.position}</div>
                  </div>
                  <Badge tone="neutral" className="ml-auto">Важно</Badge>
                </div>
                <p className="mt-4 font-head text-lg font-semibold leading-snug">{pinned.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{pinned.body}</p>
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Как вы на этой неделе?</SectionTitle>
            <Checkin initial={checkin?.mood ?? null} />
          </section>
        </div>
      </div>
    </div>
  );
}
