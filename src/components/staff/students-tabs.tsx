import Link from "next/link";
import { cn } from "@/lib/utils";

/** Вкладки раздела «Студенты» у деканата. Группа переносится между вкладками. */
export function StudentsTabs({ active, groupId }: { active: "gradebook" | "groups" | "attendance"; groupId?: string }) {
  const q = groupId ? `?group=${groupId}` : "";
  const tabs = [
    { key: "gradebook", label: "Ведомость", href: `/staff/students${q}` },
    { key: "groups", label: "Группы", href: "/staff/students/groups" },
    { key: "attendance", label: "Посещаемость", href: `/staff/attendance${q}` },
  ] as const;
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Разделы «Студенты»">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition", active === t.key ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
