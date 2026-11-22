"use client";
import Link from "next/link";
import { BookOpen, ClipboardCheck, GitBranch, LogOut } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { logoutAction } from "@/app/login/actions";
import { university } from "@/config/university";
import { MessagesLink } from "@/components/messages/messages-link";
import { AssistantProvider, OpenAssistant } from "@/components/assistant/provider";
import { Mascot } from "@/components/assistant/mascot";
import { ReminderNotice } from "@/components/reminder-notice";
import { RoleLiveNotice } from "@/components/role-live-notice";

const extra = [
  { href: "/teacher/approvals", label: "Согласования", title: "Согласования: перезачёты дисциплин", icon: GitBranch },
  { href: "/teacher/retakes", label: "Пересдачи", title: "Пересдачи: назначенные деканатом, результат", icon: ClipboardCheck },
  { href: "/teacher/library", label: "Библиотека", title: "Библиотека: материалы, по которым помощник отвечает студентам", icon: BookOpen },
];

/** Кабинет преподавателя: простая шапка — главный раздел один, остальные значками (на телефоне — подписанным рядом). */
export function TeacherShell({ children, name, department }: { children: React.ReactNode; name: string; department: string }) {
  return (
    <AssistantProvider firstName={name} role="TEACHER">
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/teacher" className="flex items-center gap-3" aria-label="Мои группы">
            <Wordmark className="text-[18px] sm:text-[20px]" />
            <span className="hidden rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-ink-fg md:inline">преподаватель</span>
          </Link>
          <div className="min-w-0 flex-1 text-right leading-tight max-md:invisible">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="hidden truncate text-xs text-muted md:block">{department}</div>
          </div>
          <OpenAssistant className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface p-1 text-sm font-semibold transition hover:border-ink md:pr-4">
            <Mascot size={32} />
            <span className="max-md:sr-only">Помощник</span>
          </OpenAssistant>
          {extra.map((x) => (
            <Link key={x.href} href={x.href} className="hidden size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg md:flex" aria-label={x.label} title={x.title}>
              <x.icon size={20} />
            </Link>
          ))}
          <MessagesLink href="/teacher/messages" className="size-11" />
          <form action={logoutAction}>
            <button type="submit" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Выйти (${name})`} title={`${name} — выйти`}>
              <LogOut size={20} />
            </button>
          </form>
        </div>
        {/* телефон и узкий планшет (до 768 px): разделы с подписями под шапкой — всё доступно без прокрутки вбок */}
        <nav className="mx-auto grid w-full max-w-5xl grid-cols-3 gap-1 px-3 pb-2.5 sm:px-5 md:hidden" aria-label="Разделы кабинета">
          {extra.map((x) => (
            <Link key={x.href} href={x.href} className="flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-1 text-[13px] font-semibold text-muted hover:bg-surface/70 hover:text-fg">
              <x.icon size={16} className="shrink-0 max-[400px]:hidden" />
              <span className="truncate">{x.label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main tabIndex={-1} className="flex-1 px-4 pb-10 pt-6 outline-none sm:px-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-xs text-muted sm:px-6">
        <div className="mx-auto max-w-5xl">{university.disclaimer}</div>
      </footer>
    </div>
    <ReminderNotice />
    <RoleLiveNotice home="/teacher" />
    </AssistantProvider>
  );
}
