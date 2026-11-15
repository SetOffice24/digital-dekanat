import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ClipboardList, Users } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getGradebook, MAX_POINTS, WORK_KINDS } from "@/server/repos/teacher";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { GradebookRow } from "./gradebook-row";

export const metadata = { title: "Журнал" };

const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });

export default async function GradebookPage({ params, searchParams }: { params: Promise<{ groupId: string; courseId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { groupId, courseId } = await params;
  const saved = Number((await searchParams).saved) || 0;
  const { teacher } = await requireTeacher();
  const book = await getGradebook(teacher, groupId, courseId);
  if (!book) notFound();
  const rows = book.rows.map((r) => ({
    enrollmentId: r.enrollmentId,
    name: r.name,
    subgroup: r.subgroup,
    total: r.total,
    grades: r.grades.map((g) => ({ id: g.id, kind: g.kind, points: g.points, value: g.value, note: g.note, date: fmt.format(g.date) })),
  }));
  return (
    <>
      <Link href="/teacher" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> На главную
      </Link>
      <PageHeader
        title={`${book.course.name} · ${book.group.name}`}
        subtitle={`Журнал, ${book.semester}-й семестр. Под каждой цифрой — вид работы и дата. Одному студенту — «+ Оценка», всей группе за работу — кнопка справа.`}
        action={
          <Link href={`/teacher/${groupId}/${courseId}/bulk`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg hover:opacity-90">
            <ClipboardList size={17} /> Оценки группе
          </Link>
        }
      />
      {saved > 0 && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <Check size={17} /> Сохранено {saved} {saved % 10 === 1 && saved % 100 !== 11 ? "оценка" : [2, 3, 4].includes(saved % 10) && ![12, 13, 14].includes(saved % 100) ? "оценки" : "оценок"} — студенты получили уведомления.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="Студентов нет" text="В этой группе никто не записан на дисциплину в текущем семестре." />
      ) : (
        <Card className="p-0 md:p-2 max-md:border-0 max-md:bg-transparent">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_4rem_auto] gap-4 px-2 py-2 text-xs font-semibold text-muted md:grid">
            <span>Студент</span>
            <span>Оценки: вид работы · дата · баллы</span>
            <span className="text-center">Сумма</span>
            <span className="w-[8.5rem]" />
          </div>
          <ul className="space-y-2.5 md:space-y-0">
            {rows.map((r) => (
              <GradebookRow key={r.enrollmentId} row={r} kinds={WORK_KINDS} max={MAX_POINTS} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
