import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getLessonAttendance } from "@/server/repos/teacher";
import { PageHeader } from "@/components/ui";
import { lessonKindLabel } from "@/lib/labels";
import { fmtDay, moscowToday, roomLabel } from "@/lib/utils";
import { AttendanceForm } from "@/components/attendance-form";
import { recognizeAbsenceAction, saveAttendanceAction } from "./actions";

export const metadata = { title: "Посещаемость" };

export default async function LessonAttendancePage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const { teacher } = await requireTeacher();
  const data = await getLessonAttendance(teacher, lessonId);
  if (!data) notFound();
  const { lesson } = data;
  const future = lesson.date.getTime() > moscowToday().getTime();
  return (
    <>
      <Link href={`/teacher/${lesson.group.id}/${lesson.course.id}/attendance`} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Посещаемость дисциплины
      </Link>
      <PageHeader
        title="Посещаемость"
        subtitle={`${lesson.course.name} · ${lesson.group.name}${lesson.subgroup ? `, подгр. ${lesson.subgroup}` : ""} · ${fmtDay(lesson.date)}, ${lesson.startTime} · ${lessonKindLabel[lesson.kind]}, ${roomLabel(lesson.room)}`}
      />
      {lesson.status === "CANCELLED" ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">Пара отменена — отмечать посещаемость не нужно.</p>
      ) : future ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">Пара ещё не началась — отметить посещаемость можно в день занятия.</p>
      ) : (
        <AttendanceForm save={saveAttendanceAction} recognize={recognizeAbsenceAction} lessonId={lesson.id} marked={data.marked} students={data.students.map((s) => ({ id: s.id, name: `${s.lastName} ${s.firstName}`, present: s.present }))} />
      )}
    </>
  );
}
