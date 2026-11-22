"use client";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { quickStatusAction } from "./inbox-actions";

export function QuickAction({ id, to, label }: { id: string; to: "IN_REVIEW" | "READY" | "DONE"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => quickStatusAction(id, to))}
      className="ml-auto inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-4 text-sm font-semibold text-fg transition hover:border-ink disabled:opacity-50"
    >
      {pending && <LoaderCircle size={15} className="animate-spin" />}
      {label}
    </button>
  );
}
