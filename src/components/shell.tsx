"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { Bell, CalendarDays, FileText, GraduationCap, House, Menu, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { university } from "@/config/university";

export type NavItem = { href: string; label: string; icon: LucideIcon; match?: (p: string) => boolean };

const studentNav: NavItem[] = [
  { href: "/", label: "Сегодня", icon: House, match: (p) => p === "/" },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/grades", label: "Учёба", icon: GraduationCap },
  { href: "/requests", label: "Заявки", icon: FileText },
  { href: "/more", label: "Ещё", icon: Menu, match: (p) => ["/more", "/profile", "/notifications", "/assistant"].some((x) => p.startsWith(x)) },
];

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { count: 0 }));

export function useUnread() {
  const { data } = useSWR<{ count: number }>("/api/notifications/unread", fetcher, { refreshInterval: 20000, revalidateOnFocus: true });
  return data?.count ?? 0;
}

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}

export function StudentShell({ children, name, group }: { children: React.ReactNode; name: string; group: string }) {
  const path = usePathname();
  const unread = useUnread();
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      {/* Сайдбар для десктопа */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <Logo size={34} />
          <div className="leading-tight">
            <div className="font-extrabold">{university.product}</div>
            <div className="text-xs text-muted">{university.fullName}</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Основная навигация">
          {[...studentNav.slice(0, 4), { href: "/notifications", label: "Уведомления", icon: Bell }, { href: "/assistant", label: "Помощник", icon: Sparkles }, { href: "/more", label: "Ещё", icon: Menu, match: (p: string) => ["/more", "/profile"].some((x) => p.startsWith(x)) }].map((item) => {
            const active = isActive(item, path);
            return (
              <Link key={item.href} href={item.href} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg")} aria-current={active ? "page" : undefined}>
                <item.icon size={20} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/notifications" && unread > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{unread}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl bg-surface-2 p-3 text-xs text-muted">
          <div className="font-semibold text-fg">{name}</div>
          <div>{group}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Шапка для телефона */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/60 bg-bg/85 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2" aria-label="На главную">
            <Logo size={28} />
            <span className="font-extrabold tracking-tight">{university.name}</span>
          </Link>
          <div className="flex-1" />
          <Link href="/assistant" className="flex size-10 items-center justify-center rounded-xl text-primary hover:bg-surface-2" aria-label="ИИ-помощник">
            <Sparkles size={21} />
          </Link>
          <Link href="/notifications" className="relative flex size-10 items-center justify-center rounded-xl hover:bg-surface-2" aria-label={`Уведомления${unread ? `, непрочитанных: ${unread}` : ""}`}>
            <Bell size={21} />
            {unread > 0 && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[18px] text-white">{unread > 9 ? "9+" : unread}</span>}
          </Link>
        </header>

        <main className="flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>

        <footer className="hidden px-8 pb-6 text-xs text-muted lg:block">{university.disclaimer}</footer>

        {/* Нижняя навигация для телефона */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden" aria-label="Основная навигация">
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {studentNav.map((item) => {
              const active = isActive(item, path);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition", active ? "text-primary" : "text-muted")} aria-current={active ? "page" : undefined}>
                    <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-primary-soft")}>
                      <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
