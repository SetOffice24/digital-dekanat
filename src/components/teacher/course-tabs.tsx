import Link from "next/link";
import { cn } from "@/lib/utils";

/** Разделы дисциплины у преподавателя: журнал, материалы, домашние задания. */
export function CourseTabs({ groupId, courseId, active, toReview = 0 }: { groupId: string; courseId: string; active: "journal" | "materials" | "homework"; toReview?: number }) {
  const base = `/teacher/${groupId}/${courseId}`;
  const tabs = [
    { key: "journal", label: "Журнал", href: base },
    { key: "materials", label: "Материалы", href: `${base}/materials` },
    { key: "homework", label: "Домашние задания", href: `${base}/homework` },
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Разделы дисциплины">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition", active === t.key ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
          {t.label}
          {t.key === "homework" && toReview > 0 && <span className={cn("rounded-full px-2 text-xs font-semibold leading-5", active === t.key ? "bg-white/20" : "bg-p-yellow text-[#0e0e10]")}>{toReview}</span>}
        </Link>
      ))}
    </nav>
  );
}
