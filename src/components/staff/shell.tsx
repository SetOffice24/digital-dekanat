"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, LayoutDashboard, LogOut, Megaphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { logoutAction } from "@/app/login/actions";
import { university } from "@/config/university";

const nav: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/staff", label: "Сводка", icon: LayoutDashboard, exact: true },
  { href: "/staff/requests", label: "Заявки", icon: FileText },
  { href: "/staff/announcements", label: "Объявления", icon: Megaphone },
  { href: "/staff/schedule", label: "Расписание", icon: CalendarDays },
];

export function StaffShell({ children, name, position }: { children: React.ReactNode; name: string; position: string }) {
  const path = usePathname();
  const active = (n: (typeof nav)[number]) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link href="/staff" className="flex items-center gap-2" aria-label="Кабинет сотрудника">
            <Logo size={28} />
            <span className="hidden font-extrabold tracking-tight sm:inline">{university.product}</span>
          </Link>
          <div className="min-w-0 flex-1 text-right leading-tight">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-xs text-muted">{position}</div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Выйти">
              <LogOut size={20} />
            </button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Разделы кабинета">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n) ? "page" : undefined}
              className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition", active(n) ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              <n.icon size={18} />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 px-4 pb-10 pt-5">{children}</main>
      <footer className="px-4 pb-6 text-xs text-muted">{university.disclaimer}</footer>
    </div>
  );
}
