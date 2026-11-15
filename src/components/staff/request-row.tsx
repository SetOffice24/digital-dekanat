import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui";
import { requestStatusLabel, requestStatusTone } from "@/lib/labels";
import { fmtDate } from "@/lib/utils";
import { isOverdue, type StaffRequestRow } from "@/server/repos/staff";

export function RequestRow({ r }: { r: StaffRequestRow }) {
  const s = r.student;
  const overdue = isOverdue(r);
  return (
    <Link href={`/staff/requests/${r.id}`} className="block rounded-[24px] border border-border/70 bg-surface p-3.5 transition hover:border-primary/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">
            {r.type.title} <span className="font-medium text-muted">№ {r.number}</span>
          </p>
          <p className="truncate text-sm text-muted">
            {s.lastName} {s.firstName} · {s.group.name}
          </p>
        </div>
        <Badge tone={requestStatusTone[r.status]}>{requestStatusLabel[r.status]}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{fmtDate(r.createdAt)}</span>
        <span>{r.assignee ? `Исполнитель: ${r.assignee.fullName}` : "Не назначена"}</span>
        {overdue && (
          <Badge tone="danger">
            <AlertTriangle size={12} /> Просрочена (срок {r.type.slaDays} дн.)
          </Badge>
        )}
      </div>
    </Link>
  );
}
