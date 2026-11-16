"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarClock, ChevronDown, ClipboardList, Clock, FileCheck2, FileQuestion } from "lucide-react";

export type AttentionItem = { key: string; title: string; text: string; href: string; tone: string; kind: "need_info" | "ready" | "retake" | "deadline" | "debt" | "changes" | "homework" };

const icons = {
  need_info: FileQuestion,
  ready: FileCheck2,
  retake: AlertTriangle,
  deadline: Clock,
  debt: AlertTriangle,
  changes: CalendarClock,
  homework: ClipboardList,
};

/** Показываем 3 главных дела, остальные — по кнопке, чтобы главная не была перегружена. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <div className="space-y-2.5">
      {shown.map((it) => {
        const Icon = icons[it.kind];
        return (
          <Link key={it.key} href={it.href} className="group flex items-center gap-3.5 rounded-[24px] border border-border/70 bg-surface p-3.5 pr-4 transition hover:border-ink/40">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${it.tone}`}>
              <Icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{it.title}</span>
              <span className="block truncate text-[13px] text-muted">{it.text}</span>
            </span>
            <ArrowUpRight size={18} className="shrink-0 text-muted transition group-hover:text-fg" />
          </Link>
        );
      })}
      {items.length > 3 && (
        <button onClick={() => setAll((v) => !v)} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-sm font-medium text-muted hover:bg-surface hover:text-fg" aria-expanded={all}>
          {all ? "Свернуть" : `Показать ещё ${items.length - 3}`}
          <ChevronDown size={16} className={all ? "rotate-180 transition" : "transition"} />
        </button>
      )}
    </div>
  );
}
