import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { loadLessonAttendance, staffLesson } from "@/server/repos/attendance";
import { PageHeader } from "@/components/ui";
import { AttendanceForm } from "@/components/attendance-form";
import { lessonKindLabel } from "@/lib/labels";
import { fmtDay, isoDate, moscowToday, roomLabel } from "@/lib/utils";
import { recognizeStaffAbsenceAction, saveStaffAttendanceAction } from "../../actions";

export const metadata = { title: "Посещаемость пары" };

export default async function StaffLessonAttendance({ params }: { params: Promise<{ lessonId: string }> }) {
  const { staff } = await requireStaff();
  const data = await loadLessonAttendance(staffLesson(staff, (await params).lessonId));
  if (!data) notFound();
  const { lesson } = data;
  const future = lesson.date.getTime() > moscowToday().getTime();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href={`/staff/schedule?group=${lesson.group.id}&date=${isoDate(lesson.date)}`} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> К расписанию
      </Link>
      <PageHeader
        title="Посещаемость"
        subtitle={`${lesson.course.name} · ${lesson.group.name}${lesson.subgroup ? `, подгр. ${lesson.subgroup}` : ""} · ${fmtDay(lesson.date)}, ${lesson.startTime} · ${lessonKindLabel[lesson.kind]}, ${roomLabel(lesson.room)} · ${lesson.teacher.fullName}`}
      />
      {lesson.status === "CANCELLED" ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">Пара отменена — отмечать посещаемость не нужно.</p>
      ) : future ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">Пара ещё не прошла — отметить посещаемость можно в день занятия.</p>
      ) : (
        <AttendanceForm save={saveStaffAttendanceAction} recognize={recognizeStaffAbsenceAction} lessonId={lesson.id} marked={data.marked} students={data.students.map((s) => ({ id: s.id, name: `${s.lastName} ${s.firstName}`, present: s.present }))} />
      )}
    </div>
  );
}
