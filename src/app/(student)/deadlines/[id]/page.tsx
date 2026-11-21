import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getDeadline } from "@/server/repos/student";
import { Card, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Дело со сроком" };

/** Дело с дедлайном: срок, к чему относится и куда идти, чтобы его выполнить. */
export default async function DeadlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { student } = await requireStudent();
  const d = await getDeadline(student, (await params).id);
  if (!d) notFound();
  const past = d.dueAt < new Date();
  const btn = "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold";
  return (
    <>
      <Link href="/" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Мой день
      </Link>
      <PageHeader title={d.title} subtitle={d.course ? d.course.name : undefined} />
      <Card className="max-w-2xl space-y-4 p-5">
        <p className="flex items-center gap-2 font-semibold">
          <Clock size={18} className={past ? "text-danger" : "text-info"} /> {past ? "Срок прошёл" : "Срок"}: до {fmtDateTime(d.dueAt)}
        </p>
        <p className="text-sm text-muted">
          {d.link
            ? "Выполнить можно по ссылке ниже."
            : d.course
              ? "Подробности — у преподавателя дисциплины: напишите ему, если неясно, что и как сдать."
              : "Это общее дело от деканата. Если неясно, что нужно сделать, — напишите в деканат, ответят в течение рабочего дня."}
        </p>
        <div className="flex flex-wrap gap-2">
          {d.link && (
            <Link href={d.link} className={`${btn} bg-ink text-ink-fg`}>
              Перейти <ArrowRight size={16} />
            </Link>
          )}
          {d.course && (
            <Link href={`/courses/${d.course.id}`} className={`${btn} ${d.link ? "border border-border" : "bg-ink text-ink-fg"}`}>
              Дисциплина и преподаватель
            </Link>
          )}
          {!d.link && !d.course && (
            <Link href="/requests/new?type=APP_OTHER" className={`${btn} bg-ink text-ink-fg`}>
              Написать в деканат
            </Link>
          )}
          <Link href="/messages" className={`${btn} border border-border`}>
            Сообщения
          </Link>
        </div>
      </Card>
    </>
  );
}
