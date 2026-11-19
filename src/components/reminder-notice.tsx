"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Bell, X } from "lucide-react";

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));
const KEY = "univer-reminder-seen";

/** Всплывающее напоминание у преподавателя и деканата (у студента — общий колокольчик уведомлений). */
export function ReminderNotice() {
  const { data } = useSWR<{ latest: { id: string; text: string } | null }>("/api/reminders/feed", fetcher, { refreshInterval: 30000, revalidateOnFocus: true });
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null);
  const latest = data?.latest ?? null;
  useEffect(() => {
    if (!latest) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(KEY);
    } catch {}
    if (seen === latest.id) return;
    try {
      localStorage.setItem(KEY, latest.id);
    } catch {}
    const t = setTimeout(() => setShown(latest), 0);
    return () => clearTimeout(t);
  }, [latest]);
  if (!shown) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-6 z-50 mx-auto max-w-md lg:inset-x-auto lg:bottom-auto lg:right-8 lg:top-24 lg:w-[26rem]">
      <div className="flex gap-3 rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_18px_50px_-18px_rgba(14,14,16,0.35)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-p-yellow text-[#0e0e10]">
          <Bell size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-muted">Напоминание</div>
          <div className="font-semibold leading-snug">{shown.text}</div>
        </div>
        <button type="button" onClick={() => setShown(null)} aria-label="Закрыть" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
