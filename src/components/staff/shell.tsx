"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, LogOut, Megaphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/logo";
import { logoutAction } from "@/app/login/actions";
import { university } from "@/config/university";

const nav: { href: string; label: string; icon: LucideIcon; exact?: boolean; match?: (p: string) => boolean }[] = [
  { href: "/staff", label: "Заявки", icon: FileText, match: (p: string) => p === "/staff" || p.startsWith("/staff/requests") },
  { href: "/staff/announcements", label: "Объявления", icon: Megaphone },
  { href: "/staff/schedule", label: "Расписание", icon: CalendarDays },
];

/** Кабинет сотрудника: шапка с вкладками на всю ширину экрана, контент до 1600 px. */
export function StaffShell({ children, name, position }: { children: React.ReactNode; name: string; position: string }) {
  const path = usePathname();
  const active = (n: (typeof nav)[number]) => (n.match ? n.match(path) : n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));
  return (
    <div className="sky-glow flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[100rem] items-center gap-3 px-4 py-3 sm:px-6 md:px-8 lg:px-10">
          <Link href="/staff" className="flex items-center gap-3" aria-label="Кабинет сотрудника">
            <Wordmark className="text-[18px] sm:text-[20px]" />
            <span className="hidden rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-ink-fg sm:inline">деканат</span>
          </Link>
          <nav className="ml-6 hidden gap-1 lg:flex" aria-label="Разделы кабинета">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold transition", active(n) ? "bg-ink text-ink-fg" : "text-muted hover:bg-surface/70 hover:text-fg")}>
                <n.icon size={18} />
                {n.label}
              </Link>
            ))}
          </nav>
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
        <nav className="mx-auto flex w-full max-w-[100rem] gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none] sm:px-5 md:px-7 lg:hidden" aria-label="Разделы кабинета">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined} className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold transition", active(n) ? "bg-ink text-ink-fg" : "text-muted hover:bg-surface/70 hover:text-fg")}>
              <n.icon size={18} />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 px-4 pb-10 pt-6 sm:px-6 md:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[100rem]">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-xs text-muted sm:px-6 md:px-8 lg:px-10">
        <div className="mx-auto max-w-[100rem]">{university.disclaimer}</div>
      </footer>
    </div>
  );
}
