"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Вкладки раздела с счётчиками (сводка / согласования / приём). */
export function ServiceTabs({ tabs }: { tabs: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1" aria-label="Разделы">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", active ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink")}>
            {t.label}
            {!!t.count && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[12px] leading-5", active ? "bg-ink-fg/20" : "bg-danger text-white")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
