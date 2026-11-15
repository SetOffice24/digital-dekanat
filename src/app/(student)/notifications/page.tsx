import Link from "next/link";
import { Bell, CalendarClock, Clock, FileText, GraduationCap, Info, Megaphone } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import { requireStudent } from "@/server/auth";
import { listAnnouncements, listNotifications } from "@/server/repos/student";
import { EmptyState, PageHeader } from "@/components/ui";
import { cn, fmtDate, relativeTime } from "@/lib/utils";
import { MarkAllRead, MarkOnOpen } from "./mark-read";

export const metadata = { title: "Уведомления" };

const icons: Record<NotificationKind, React.ReactNode> = {
  SCHEDULE_CHANGE: <CalendarClock size={19} />,
  REQUEST_STATUS: <FileText size={19} />,
  ANNOUNCEMENT: <Megaphone size={19} />,
  DEADLINE: <Clock size={19} />,
  GRADE: <GraduationCap size={19} />,
  SYSTEM: <Info size={19} />,
};
const tones: Record<NotificationKind, string> = {
  SCHEDULE_CHANGE: "bg-warning-soft text-warning",
  REQUEST_STATUS: "bg-success-soft text-success",
  ANNOUNCEMENT: "bg-primary-soft text-primary",
  DEADLINE: "bg-info-soft text-info",
  GRADE: "bg-danger-soft text-danger",
  SYSTEM: "bg-surface-2 text-muted",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { student, user } = await requireStudent();
  const { tab = "all" } = await searchParams;
  const [items, news] = await Promise.all([listNotifications(user.id, tab === "unread"), tab === "news" ? listAnnouncements(student, 30) : Promise.resolve([])]);
  const unread = items.filter((n) => !n.readAt).length;
  const tabs = [
    { k: "all", l: "Все" },
    { k: "unread", l: "Непрочитанные" },
    { k: "news", l: "Объявления деканата" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Уведомления" action={tab !== "news" && unread > 0 ? <MarkAllRead /> : undefined} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="tablist">
        {tabs.map((t) => (
          <Link key={t.k} href={`/notifications?tab=${t.k}`} role="tab" aria-selected={tab === t.k} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold", tab === t.k ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface text-muted")}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "news" ? (
        news.length ? (
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
            {news.map((a, i) => (
              <article key={a.id} className={cn("px-4 py-4 sm:px-5", i > 0 && "border-t border-border/60")}>
                <h3 className="font-semibold leading-snug">{a.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {fmtDate(a.publishedAt)} · {a.pinned ? "закреплено · " : ""}
                  {a.audience === "GROUP" ? "для вашей группы" : a.audience === "FACULTY" ? "для факультета" : "для всех"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Megaphone size={22} />} title="Объявлений нет" />
        )
      ) : items.length ? (
        <div className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {items.map((n, i) => {
            const body = (
              <div className={cn("flex gap-3 px-4 py-3.5 transition hover:bg-surface-2/60 sm:px-5", i > 0 && "border-t border-border/60")}>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", n.readAt ? "bg-surface-2 text-muted" : tones[n.kind])}>{icons[n.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("leading-snug", n.readAt ? "font-medium text-fg/80" : "font-semibold")}>{n.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      {relativeTime(n.createdAt)}
                      {!n.readAt && <span className="size-2 rounded-full bg-primary" aria-label="Не прочитано" />}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                </div>
              </div>
            );
            return n.link ? (
              <MarkOnOpen key={n.id} id={n.id} href={n.link} unread={!n.readAt}>
                {body}
              </MarkOnOpen>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Bell size={22} />} title={tab === "unread" ? "Всё прочитано" : "Уведомлений пока нет"} text="Здесь появятся переносы пар, статусы заявок и напоминания о дедлайнах." />
      )}
    </div>
  );
}
