import { NextResponse } from "next/server";
import { apiStudent } from "@/server/auth";
import { getLessons } from "@/server/repos/student";
import { addDays, mondayOf, moscowToday } from "@/lib/utils";
import { lessonKindLabel } from "@/lib/labels";

const esc = (s: string) => s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
const stamp = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - 3, m));
  return t.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
};

/** Экспорт расписания на 4 недели в формате iCalendar (только свои занятия). */
export async function GET() {
  const auth = await apiStudent();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const from = mondayOf(moscowToday());
  const lessons = await getLessons(auth.student, from, addDays(from, 28));
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Univer//Digital Dekanat//RU", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Расписание · Универ"];
  for (const l of lessons) {
    if (l.status === "CANCELLED") continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${l.id}@univer.example`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(l.date, l.startTime)}`,
      `DTEND:${stamp(l.date, l.endTime)}`,
      `SUMMARY:${esc(`${l.course.name} (${lessonKindLabel[l.kind]})`)}`,
      `LOCATION:${esc(`${l.room}, ${l.building}`)}`,
      `DESCRIPTION:${esc(`Преподаватель: ${l.teacher.fullName}${l.changeNote ? `\n${l.changeNote}` : ""}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="univer-schedule.ics"', "Cache-Control": "no-store" },
  });
}
