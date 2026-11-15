import { Megaphone, Pin } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listAnnouncements, listFaculties, listGroups } from "@/server/repos/staff";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { AnnouncementForm } from "./form";

export const metadata = { title: "Объявления" };

export default async function StaffAnnouncements() {
  const { staff } = await requireStaff();
  const [items, faculties, groups] = await Promise.all([listAnnouncements(staff), listFaculties(staff), listGroups(staff)]);
  const audienceText = (a: (typeof items)[number]) =>
    a.audience === "ALL" ? "Всем" : a.audience === "FACULTY" ? `Факультет ${a.faculty?.shortName ?? ""}` : `Группа ${a.group?.name ?? ""}`;
  return (
    <>
      <PageHeader title="Объявления" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="order-2 md:order-1">
          <SectionTitle>Опубликованные</SectionTitle>
          {items.length ? (
            <div className="space-y-2.5">
              {items.map((a) => (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{a.title}</h3>
                    {a.pinned && <Pin size={16} className="mt-1 shrink-0 text-primary" aria-label="Закреплено" />}
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone="primary">{audienceText(a)}</Badge>
                    <span>{fmtDateTime(a.publishedAt)} · {a.author.fullName}</span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Megaphone size={22} />} title="Объявлений пока нет" text="Создайте первое — студенты получат уведомление." />
          )}
        </div>
        <Card className="order-1 h-fit md:order-2">
          <SectionTitle>Новое объявление</SectionTitle>
          <AnnouncementForm faculties={faculties.map((f) => ({ id: f.id, name: f.name }))} groups={groups.map((g) => ({ id: g.id, name: g.name }))} canAll={!staff.facultyId} />
        </Card>
      </div>
    </>
  );
}
