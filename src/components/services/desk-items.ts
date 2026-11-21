import "server-only";
import type { deskAppointments } from "@/server/services/appointments";
import type { DeskItem } from "./desk";

const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const day = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Moscow" });

export function toDeskItems(rows: Awaited<ReturnType<typeof deskAppointments>>, requestBase: string): DeskItem[] {
  const now = Date.now();
  return rows.map((a) => ({
    id: a.id,
    time: time.format(a.startsAt),
    day: day.format(a.startsAt),
    student: `${a.student.lastName} ${a.student.firstName}`,
    group: a.student.group.name,
    purpose: a.purpose,
    status: a.status,
    request: a.request ? { href: `${requestBase}/${a.request.id}`, label: `№${a.request.number} ${a.request.type.title}` } : null,
    past: a.startsAt.getTime() <= now + 15 * 60_000,
  }));
}
