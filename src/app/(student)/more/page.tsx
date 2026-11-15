import Link from "next/link";
import { Bell, ChevronRight, HeartHandshake, Info, LogOut, MapPin, Sparkles, User } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getProfile } from "@/server/repos/student";
import { logoutAction } from "@/app/login/actions";
import { Card, SectionTitle } from "@/components/ui";
import { university } from "@/config/university";
import { ThemeToggle } from "./theme-toggle";

export const metadata = { title: "Ещё" };

export default async function MorePage() {
  const { student } = await requireStudent();
  const p = await getProfile(student);
  const links = [
    { href: "/profile", icon: <User size={20} />, label: "Профиль", hint: "Данные студента, зачётка" },
    { href: "/notifications", icon: <Bell size={20} />, label: "Уведомления", hint: "Переносы, заявки, дедлайны" },
    { href: "/assistant", icon: <Sparkles size={20} />, label: "ИИ-помощник", hint: "Ответит и заполнит заявление" },
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/profile" className="mb-5 flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-primary-fg">
          {p.firstName[0]}
          {p.lastName[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">
            {p.lastName} {p.firstName}
          </span>
          <span className="block text-sm text-muted">
            {p.group.name} · {p.course} курс · {p.faculty.shortName}
          </span>
        </span>
        <ChevronRight className="text-muted" />
      </Link>

      <Card className="divide-y divide-border p-0">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <span className="text-primary">{l.icon}</span>
            <span className="flex-1">
              <span className="block font-semibold">{l.label}</span>
              <span className="block text-xs text-muted">{l.hint}</span>
            </span>
            <ChevronRight size={18} className="text-muted" />
          </Link>
        ))}
        <ThemeToggle />
      </Card>

      <SectionTitle>Деканат</SectionTitle>
      <Card className="space-y-2 text-sm">
        <p className="flex items-start gap-2">
          <MapPin size={16} className="mt-0.5 shrink-0 text-muted" /> {university.deanOffice.room}, {university.deanOffice.hours}
        </p>
        <p className="flex items-start gap-2">
          <HeartHandshake size={16} className="mt-0.5 shrink-0 text-muted" /> Психологическая поддержка — студенческий центр, каб. 115 (анонимно, бесплатно)
        </p>
      </Card>

      <form action={logoutAction} className="mt-5">
        <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface font-semibold text-danger hover:bg-danger-soft">
          <LogOut size={18} /> Выйти
        </button>
      </form>

      <p className="mt-6 flex gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" /> {university.disclaimer}
      </p>
    </div>
  );
}
