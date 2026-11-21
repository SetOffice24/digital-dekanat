"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Latest = { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string } | null;

/**
 * Всплывающее извещение: как только деканат перенёс или отменил пару (или пришло любое новое уведомление),
 * студент видит карточку поверх страницы, а расписание на экране обновляется само.
 * Когда приложение закрыто или свёрнуто — уведомление приходит как push (см. src/server/push.ts, public/sw.js).
 */
/** Можно ли перерисовать страницу: человек не печатает в поле (иначе обновление сбило бы ввод). */
function safeToRefresh() {
  const el = document.activeElement as HTMLElement | null;
  return !(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

export function LiveNotice({ latest, count, fallbackHref = "/notifications" }: { latest: Latest; count: number; fallbackHref?: string }) {
  const router = useRouter();
  const seen = useRef<string | null | undefined>(undefined); // undefined — ещё не знаем исходное состояние
  const prevCount = useRef(count);
  const [shown, setShown] = useState<{ n: NonNullable<Latest>; more: number } | null>(null);

  useEffect(() => {
    // первая загрузка — запоминаем, что уже было, и ничего не показываем
    if (seen.current === undefined) {
      seen.current = latest?.id ?? null;
      prevCount.current = count;
      return;
    }
    if (latest && latest.id !== seen.current) {
      const more = Math.max(0, count - prevCount.current - 1);
      seen.current = latest.id;
      setShown({ n: latest, more });
      // данные на экране — свежие: изменения расписания всегда, остальное (проверка ДЗ, статус заявки, новая сдача) —
      // если человек сейчас ничего не вводит; иначе обновится при следующем переходе
      if (latest.kind === "SCHEDULE_CHANGE" || safeToRefresh()) router.refresh();
    }
    prevCount.current = count;
  }, [latest, count, router]);

  useEffect(() => {
    // изменения расписания висят, пока студент их не закроет; остальное — исчезает само
    if (!shown || shown.n.kind === "SCHEDULE_CHANGE") return;
    const t = setTimeout(() => setShown(null), 12000);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const { n, more } = shown;
  const schedule = n.kind === "SCHEDULE_CHANGE";
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md animate-[notice-in_.25s_ease-out] lg:inset-x-auto lg:bottom-auto lg:right-8 lg:top-24 lg:w-[26rem]">
      <div className="flex gap-3 rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_18px_50px_-18px_rgba(14,14,16,0.35)]">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", schedule ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary")}>{schedule ? <CalendarClock size={19} /> : <Bell size={19} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">{schedule ? "Изменение в расписании" : "Новое уведомление"}</div>
          <div className="font-semibold leading-snug">{n.title}</div>
          <p className="mt-0.5 line-clamp-3 text-sm text-muted">{n.body}</p>
          <div className="mt-2.5 flex items-center gap-3">
            <Link href={n.link ?? fallbackHref} onClick={() => setShown(null)} className="inline-flex min-h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg">
              {schedule ? "Открыть расписание" : "Открыть"}
            </Link>
            {more > 0 && fallbackHref === "/notifications" && (
              <Link href="/notifications" onClick={() => setShown(null)} className="text-sm font-medium text-muted hover:text-fg">
                и ещё {more}
              </Link>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setShown(null)} aria-label="Закрыть" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
