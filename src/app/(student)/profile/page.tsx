import Link from "next/link";
import { ArrowUpRight, Bell, HeartHandshake, LogOut, MapPin, ShieldCheck } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getCheckin, getProfile } from "@/server/repos/student";
import { mondayOf, moscowToday } from "@/lib/utils";
import { Checkin } from "../checkin";
import { logoutAction } from "@/app/login/actions";
import { university } from "@/config/university";
import { ThemeToggle } from "../more/theme-toggle";

export const metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const { student } = await requireStudent();
  const [p, checkin] = await Promise.all([getProfile(student), getCheckin(student, mondayOf(moscowToday()))]);
  const rows = [
    ["Факультет", p.faculty.name],
    ["Направление", `${p.program.code} ${p.program.name}`],
    ["Курс и группа", `${p.course} курс · ${p.group.name}, подгруппа ${p.subgroup}`],
    ["Форма обучения", "Очная, бюджет"],
    ["№ зачётной книжки", p.recordBookNo],
    ["Стипендия", p.scholarship ? "Академическая" : "Не назначена"],
    ["Почта", p.email ?? "—"],
    ["Логин", p.user.login],
  ];
  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Шапка профиля */}
      <section className="flex flex-col items-start gap-5 pb-8 pt-2 sm:flex-row sm:items-center lg:pt-6">
        <span className="flex size-24 shrink-0 items-center justify-center rounded-full bg-p-yellow font-head text-3xl font-semibold text-[#0e0e10]">
          {p.firstName[0]}
          {p.lastName[0]}
        </span>
        <div className="min-w-0">
          <h1 className="font-head text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            {p.firstName} {p.lastName}
          </h1>
          <p className="mt-2 text-lg text-muted">
            <b className="font-semibold text-fg">{p.group.name}</b> · {p.course} курс · {p.faculty.shortName}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
        <section className="rounded-[28px] border border-border/70 bg-surface p-2">
          <h2 className="px-4 pb-1 pt-3 font-head text-lg font-semibold">Данные студента</h2>
          <dl>
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-2xl px-4 py-2.5 sm:flex-row sm:gap-4">
                <dt className="shrink-0 text-sm text-muted sm:w-44">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="flex items-start gap-1.5 px-4 pb-3 pt-1 text-xs text-muted">
            <ShieldCheck size={14} className="mt-px shrink-0 text-success" /> Эти данные видите только вы. Нашли ошибку? Напишите в деканат: «Заявки» → «Обращение в деканат».
          </p>
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
            <Link href="/notifications" className="flex min-h-16 items-center gap-3 px-5 hover:bg-surface-2">
              <span className="flex size-10 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">
                <Bell size={18} />
              </span>
              <span className="flex-1 font-medium">Уведомления</span>
              <ArrowUpRight size={18} className="text-muted" />
            </Link>
            <div className="border-t border-border/70">
              <ThemeToggle />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-head text-lg font-semibold">Как вы на этой неделе?</h2>
            <Checkin initial={checkin?.mood ?? null} />
          </section>

          <section className="space-y-3 rounded-[28px] border border-border/70 bg-surface p-5 text-sm">
            <h2 className="font-head text-lg font-semibold">Куда обратиться</h2>
            <p className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-muted" /> Деканат — {university.deanOffice.room}, {university.deanOffice.hours}
            </p>
            <p className="flex items-start gap-2">
              <HeartHandshake size={16} className="mt-0.5 shrink-0 text-muted" /> Психолог — студенческий центр, каб. 115 (анонимно, бесплатно)
            </p>
          </section>

          <form action={logoutAction}>
            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink font-semibold transition hover:bg-ink hover:text-ink-fg">
              <LogOut size={18} /> Выйти
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
