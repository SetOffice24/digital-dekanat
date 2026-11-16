import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getGradebook } from "@/server/repos/teacher";
import { listAssignments } from "@/server/repos/homework";
import { ACCEPT } from "@/server/files";
import { EmptyState, PageHeader } from "@/components/ui";
import { CourseTabs } from "@/components/teacher/course-tabs";
import { cn, fmtDateTime } from "@/lib/utils";
import { CreateAssignment } from "./create-form";

export const metadata = { title: "Домашние задания" };

export default async function TeacherHomework({ params }: { params: Promise<{ groupId: string; courseId: string }> }) {
  const { groupId, courseId } = await params;
  const { teacher } = await requireTeacher();
  const [book, items] = await Promise.all([getGradebook(teacher, groupId, courseId), listAssignments(teacher, groupId, courseId)]);
  if (!book || !items) notFound();
  const toReview = items.reduce((a, x) => a + x.toReview, 0);
  const now = new Date();
  return (
    <>
      <Link href="/teacher" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> На главную
      </Link>
      <PageHeader title={`${book.course.name} · ${book.group.name}`} subtitle={toReview ? `Ждут проверки: ${toReview}. Откройте задание, чтобы принять или вернуть на доработку.` : "Выдайте задание — студенты получат уведомление и смогут сдать файлы."} />
      <CourseTabs groupId={groupId} courseId={courseId} active="homework" toReview={toReview} />
      <CreateAssignment groupId={groupId} courseId={courseId} accept={ACCEPT} />
      {items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={22} />} title="Заданий пока нет" text="Нажмите «Выдать задание»: название, описание, срок и, если нужно, файлы." />
      ) : (
        <ul className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {items.map((a, i) => {
            const past = a.dueAt < now;
            return (
              <li key={a.id} className={cn(i > 0 && "border-t border-border/60")}>
                <Link href={`/teacher/${groupId}/${courseId}/homework/${a.id}`} className="group flex items-center gap-4 px-4 py-4 transition hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{a.title}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      {past ? "Срок прошёл" : "Срок"}: {fmtDateTime(a.dueAt)} · сдали {a.submitted} из {a.total}
                      {a.accepted > 0 && ` · принято ${a.accepted}`}
                    </div>
                  </div>
                  {a.toReview > 0 && <span className="shrink-0 rounded-full bg-p-yellow px-3 py-1 text-xs font-semibold text-[#0e0e10]">проверить {a.toReview}</span>}
                  <ArrowRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
