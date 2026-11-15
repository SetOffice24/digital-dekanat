"use client";
import Link from "next/link";
import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { useSWRConfig } from "swr";
import { markReadAction } from "../student-actions";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  const { mutate } = useSWRConfig();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { await markReadAction(); mutate("/api/notifications/unread"); })}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-surface-2 disabled:opacity-50"
    >
      <CheckCheck size={17} /> Прочитать все
    </button>
  );
}

export function MarkOnOpen({ id, href, unread, children }: { id: string; href: string; unread: boolean; children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  return (
    <Link
      href={href}
      onClick={() => {
        if (unread) markReadAction(id).then(() => mutate("/api/notifications/unread"));
      }}
      className="block"
    >
      {children}
    </Link>
  );
}
