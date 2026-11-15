import { CalendarOff } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups, listLessons } from "@/server/repos/staff";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { lessonKindLabel } from "@/lib/labels";
import { fmtDay, isoDate, moscowToday, parseIsoDate } from "@/lib/utils";
import { CancelForm, MoveForm } from "./forms";

export const metadata = { title: "Расписание" };

export default async function StaffSchedule({ searchParams }: { searchParams: Promise<{ group?: string; date?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const groups = await listGroups(staff);
  const group = groups.find((g) => g.id === sp.group) ?? groups[0];
  const date = parseIsoDate(sp.date) ?? moscowToday();
  const lessons = group ? await listLessons(staff, group.id, date) : [];

  return (
    <>
      <PageHeader title="Расписание" subtitle={group ? `${group.name} · ${fmtDay(date)}` : undefined} />
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <Select name="group" defaultValue={group?.id} aria-label="Группа" className="sm:w-44">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Input type="date" name="date" defaultValue={isoDate(date)} aria-label="Дата" className="sm:w-48" required />
        <Button type="submit" className="col-span-2 sm:col-span-1">
          Показать
        </Button>
      </form>

      {lessons.length ? (
        <div className="space-y-3">
          {lessons.map((l) => (
            <Card key={l.id} className={l.status === "CANCELLED" ? "opacity-70" : undefined}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{l.course.name}</p>
                  <p className="text-sm text-muted">
                    {l.startTime}–{l.endTime} · {lessonKindLabel[l.kind]} · ауд. {l.room}, {l.building}
                  </p>
                  <p className="text-sm text-muted">
                    {l.teacher.fullName}
                    {l.subgroup ? ` · подгруппа ${l.subgroup}` : ""}
                  </p>
                </div>
                {l.status === "MOVED" && <Badge tone="warning">Перенесено</Badge>}
                {l.status === "CANCELLED" && <Badge tone="danger">Отменено</Badge>}
              </div>
              {l.changeNote && <p className="mt-2 text-sm">Причина: {l.changeNote}</p>}
              {l.status !== "CANCELLED" && (
                <div className="mt-3 space-y-2">
                  <details className="rounded-xl border border-border">
                    <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">Перенести</summary>
                    <div className="border-t border-border p-3">
                      <MoveForm id={l.id} date={isoDate(l.date)} room={l.room} />
                    </div>
                  </details>
                  <details className="rounded-xl border border-border">
                    <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-danger">Отменить</summary>
                    <div className="border-t border-border p-3">
                      <CancelForm id={l.id} />
                    </div>
                  </details>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<CalendarOff size={22} />} title="В этот день занятий нет" text="Выберите другую дату или группу." />
      )}
    </>
  );
}
