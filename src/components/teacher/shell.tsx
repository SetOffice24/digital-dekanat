"use client";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { logoutAction } from "@/app/login/actions";
import { university } from "@/config/university";
import { MessagesLink } from "@/components/messages/messages-link";
import { AssistantProvider, OpenAssistant } from "@/components/assistant/provider";
import { Mascot } from "@/components/assistant/mascot";

/** Кабинет преподавателя: простая шапка без навигации — раздел один. */
export function TeacherShell({ children, name, department }: { children: React.ReactNode; name: string; department: string }) {
  return (
    <AssistantProvider firstName={name} role="TEACHER">
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/teacher" className="flex items-center gap-3" aria-label="Мои группы">
            <Wordmark className="text-[18px] sm:text-[20px]" />
            <span className="hidden rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-ink-fg sm:inline">преподаватель</span>
          </Link>
          <div className="min-w-0 flex-1 text-right leading-tight">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="hidden truncate text-xs text-muted sm:block">{department}</div>
          </div>
          <OpenAssistant className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface p-1 text-sm font-semibold transition hover:border-ink sm:pr-4">
            <Mascot size={32} />
            <span className="max-sm:sr-only">Помощник</span>
          </OpenAssistant>
          <MessagesLink href="/teacher/messages" className="size-11" />
          <form action={logoutAction}>
            <button type="submit" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Выйти">
              <LogOut size={20} />
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 pb-10 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-xs text-muted sm:px-6">
        <div className="mx-auto max-w-5xl">{university.disclaimer}</div>
      </footer>
    </div>
    </AssistantProvider>
  );
}
