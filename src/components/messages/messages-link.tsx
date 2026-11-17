"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { count: 0 }));

/** Значок «Сообщения» в шапке со счётчиком непрочитанных (обновляется каждые 10 с и при возврате на вкладку). */
export function MessagesLink({ href, className }: { href: string; className?: string }) {
  const path = usePathname();
  const { data } = useSWR<{ count: number }>("/api/messages/unread", fetcher, { refreshInterval: 10000, revalidateOnFocus: true });
  const n = data?.count ?? 0;
  const active = path.startsWith(href);
  return (
    <Link
      href={href}
      aria-label={`Сообщения${n ? `, новых: ${n}` : ""}`}
      title="Сообщения"
      className={cn("relative flex size-12 shrink-0 items-center justify-center rounded-full border transition", active ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border", className)}
    >
      <MessagesSquare size={20} />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full border-2 border-bg bg-danger px-1 text-center text-[11px] font-bold leading-4 text-white">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}
