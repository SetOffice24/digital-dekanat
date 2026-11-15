import Link from "next/link";
import { Bell, CalendarClock, Clock, FileText, GraduationCap, Info, Megaphone } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import { requireStudent } from "@/server/auth";
import { listAnnouncements, listNotifications } from "@/server/repos/student";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn, fmtDate, relativeTime } from "@/lib/utils";
import { notificationKindLabel } from "@/lib/labels";
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
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Уведомления" action={tab !== "news" && unread > 0 ? <MarkAllRead /> : undefined} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="tablist">
        {tabs.map((t) => (
          <Link key={t.k} href={`/notifications?tab=${t.k}`} role="tab" aria-selected={tab === t.k} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold", tab === t.k ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-muted")}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "news" ? (
        news.length ? (
          <div className="space-y-2">
            {news.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{a.title}</span>
                  {a.pinned && <Badge tone="primary">Закреплено</Badge>}
                  {a.audience !== "ALL" && <Badge>{a.audience === "GROUP" ? "Для вашей группы" : "Для факультета"}</Badge>}
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm">{a.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {a.author.fullName}, {a.author.position.toLowerCase()} · {fmtDate(a.publishedAt)}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Megaphone size={22} />} title="Объявлений нет" />
        )
      ) : items.length ? (
        <div className="space-y-2">
          {items.map((n) => {
            const body = (
              <div className={cn("flex gap-3 rounded-2xl border p-3.5 transition", n.readAt ? "border-border bg-surface" : "border-primary/30 bg-primary-soft/40")}>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tones[n.kind])}>{icons[n.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold leading-snug">{n.title}</span>
                    {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Не прочитано" />}
                  </div>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {notificationKindLabel[n.kind]} · {relativeTime(n.createdAt)}
                  </p>
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
