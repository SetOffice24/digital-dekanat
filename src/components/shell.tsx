"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { Bell, CalendarDays, FileText, GraduationCap, House, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, Wordmark } from "./logo";
import { AssistantProvider, OpenAssistant } from "./assistant/provider";
import { Mascot } from "./assistant/mascot";
import { university } from "@/config/university";
import { LiveNotice, type Latest } from "./live-notice";
import { MessagesLink } from "./messages/messages-link";

/**
 * Простая навигация: 4 раздела + 3 действия.
 * Разделы: Главная · Расписание · Учёба · Услуги (единое окно).
 * Действия (справа в шапке): уведомления, ИИ-помощник, профиль.
 * Десктоп — капсулы в шапке; телефон — нижняя панель с центральной кнопкой помощника.
 */
type NavItem = { href: string; label: string; icon: LucideIcon; match?: (p: string) => boolean };

const nav: NavItem[] = [
  { href: "/", label: "Главная", icon: House, match: (p) => p === "/" },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  // домашние задания и материалы — часть «Учёбы», отдельного раздела в меню нет
  { href: "/grades", label: "Учёба", icon: GraduationCap, match: (p) => p.startsWith("/grades") || p.startsWith("/homework") || p.startsWith("/courses") || p.startsWith("/attendance") },
  // единое окно деканата: заявки, жизненные ситуации, документы, запись на приём
  { href: "/requests", label: "Услуги", icon: FileText, match: (p) => p.startsWith("/requests") || p.startsWith("/services") },
];

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { count: 0, latest: null }));

/** Непрочитанные уведомления: опрос каждые 10 с и при возврате на вкладку — изменения расписания видны почти сразу. */
export function useUnread() {
  const { data } = useSWR<{ count: number; latest: Latest; assistantChat?: string | null }>("/api/notifications/unread", fetcher, { refreshInterval: 10000, revalidateOnFocus: true });
  // assistantChat — помощник написал сам, а студент ещё не открыл (точка на кнопке помощника)
  return { count: data?.count ?? 0, latest: data?.latest ?? null, ready: data !== undefined, assistantNew: !!data?.assistantChat };
}

/** Точка «помощник написал сам». */
const NewDot = () => <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-bg bg-danger" aria-label="Новое сообщение помощника" />;

const isActive = (item: NavItem, path: string) => (item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/"));

const capsule = "inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-[15px] font-medium transition";

export function StudentShell({ children, name, firstName, group, initials }: { children: React.ReactNode; name: string; firstName: string; group: string; initials: string }) {
  const path = usePathname();
  const { count: unread, latest, ready, assistantNew } = useUnread();
  const onProfile = path.startsWith("/profile");
  const onNotes = path.startsWith("/notifications");

  return (
    <AssistantProvider firstName={firstName}>
      <div className="min-h-dvh bg-bg">
        {/* ---------- Шапка ---------- */}
        <header className="sticky top-0 z-30 [@media(max-height:500px)]:static bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[90rem] items-center gap-1.5 px-4 py-3 sm:gap-2 sm:px-6 lg:gap-3 lg:px-10 lg:py-5">
            <Link href="/" className="flex items-center gap-2 sm:gap-3" aria-label="Главная">
              <Logo size={44} />
              {/* на самых узких экранах (до 360 px) — только значок: кнопки справа сохраняют полный размер нажатия */}
              <Wordmark className="text-[16px] max-[359px]:hidden lg:hidden xl:inline-flex xl:text-[17px]" />
            </Link>

            <nav className="ml-4 hidden items-center gap-2 lg:flex" aria-label="Разделы">
              {nav.map((item) => {
                const active = isActive(item, path);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn(capsule, active ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface text-fg hover:border-border")}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex-1" />

            <OpenAssistant className={cn(capsule, "hidden border-transparent bg-surface pl-2 pr-5 hover:border-border lg:inline-flex")}>
              <span className="relative">
                <Mascot size={30} />
                {assistantNew && <NewDot />}
              </span>
              Помощник
            </OpenAssistant>

            <MessagesLink href="/messages" />

            <Link href="/notifications" aria-label={`Уведомления${unread ? `, непрочитанных: ${unread}` : ""}`} className={cn("relative flex size-12 items-center justify-center rounded-full border transition", onNotes ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
              <Bell size={20} />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full border-2 border-bg bg-danger px-1 text-center text-[11px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>

            <Link href="/profile" aria-label="Профиль" className={cn("flex min-h-12 items-center gap-2.5 rounded-full border p-1 transition lg:pr-4", onProfile ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
              <span className="flex size-10 items-center justify-center rounded-full bg-p-yellow text-sm font-bold text-[#0e0e10]">{initials}</span>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-sm font-semibold">{name}</span>
                <span className={cn("block text-xs", onProfile ? "opacity-70" : "text-muted")}>{group}</span>
              </span>
            </Link>
          </div>
        </header>

        <main tabIndex={-1} className="mx-auto w-full max-w-[90rem] outline-none px-4 pb-32 pt-2 sm:px-6 lg:px-10 lg:pb-16 lg:pt-4">{children}</main>

        <footer className="mx-auto hidden max-w-[90rem] px-10 pb-8 text-xs text-muted lg:block">{university.disclaimer}</footer>

        {/* ---------- Нижняя панель (телефон, планшет) ---------- */}
        <nav className="pb-safe fixed inset-x-3 bottom-3 z-30 rounded-[30px] bg-ink text-ink-fg shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45)] lg:hidden" aria-label="Разделы">
          <ul className="mx-auto grid max-w-md grid-cols-5 items-center px-2 py-1.5">
            {[nav[0], nav[1], null, nav[2], nav[3]].map((item) =>
              item ? (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isActive(item, path) ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition", isActive(item, path) ? "opacity-100" : "opacity-55")}>
                    <item.icon size={21} strokeWidth={isActive(item, path) ? 2.4 : 2} />
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key="uni" className="flex justify-center">
                  <OpenAssistant className="-mt-7 flex size-16 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-6px_rgba(0,0,0,0.35)] ring-4 ring-bg transition active:scale-95">
                    <span className="relative">
                      <Mascot size={40} />
                      {assistantNew && <NewDot />}
                    </span>
                    <span className="sr-only">{assistantNew ? "Открыть помощника — есть новое сообщение" : "Открыть помощника"}</span>
                  </OpenAssistant>
                </li>
              ),
            )}
          </ul>
        </nav>
      </div>
      {ready && <LiveNotice latest={latest} count={unread} />}
    </AssistantProvider>
  );
}
