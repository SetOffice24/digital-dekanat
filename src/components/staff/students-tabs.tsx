import Link from "next/link";
import { requireStaff } from "@/server/auth";
import { photoQueueCount } from "@/server/repos/photos";
import { cn } from "@/lib/utils";

/** Вкладки раздела «Студенты» у деканата. Группа переносится между вкладками; у «Фото» — число фото на проверке. */
export async function StudentsTabs({ active, groupId }: { active: "gradebook" | "groups" | "attendance" | "photos" | "accounts"; groupId?: string }) {
  const { staff } = await requireStaff();
  const pendingPhotos = await photoQueueCount(staff);
  const q = groupId ? `?group=${groupId}` : "";
  const tabs = [
    { key: "gradebook", label: "Ведомость", href: `/staff/students${q}` },
    { key: "groups", label: "Группы", href: "/staff/students/groups" },
    { key: "attendance", label: "Посещаемость", href: `/staff/attendance${q}` },
    { key: "photos", label: "Фото", href: `/staff/students/photos${q}`, badge: pendingPhotos },
    { key: "accounts", label: "Аккаунты", href: "/staff/students/accounts" },
  ] as const;
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5 sm:mb-5 sm:gap-2" aria-label="Разделы «Студенты»">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition sm:min-h-10 sm:px-4", active === t.key ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
          {t.label}
          {"badge" in t && t.badge > 0 && <span className="rounded-full bg-p-yellow px-1.5 text-xs font-semibold text-[#0e0e10]" aria-label={`на проверке: ${t.badge}`}>{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
