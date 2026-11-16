import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ExternalLink, Paperclip } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getGradebook } from "@/server/repos/teacher";
import { listMaterials } from "@/server/repos/homework";
import { ACCEPT } from "@/server/files";
import { EmptyState, PageHeader } from "@/components/ui";
import { CourseTabs } from "@/components/teacher/course-tabs";
import { fmtDate } from "@/lib/utils";
import { AddMaterial, DeleteMaterial } from "./material-forms";

export const metadata = { title: "Материалы" };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1048576).toFixed(1).replace(".", ",")} МБ`);

export default async function MaterialsPage({ params }: { params: Promise<{ groupId: string; courseId: string }> }) {
  const { groupId, courseId } = await params;
  const { teacher } = await requireTeacher();
  const [book, items] = await Promise.all([getGradebook(teacher, groupId, courseId), listMaterials(teacher, groupId, courseId)]);
  if (!book || !items) notFound();
  return (
    <>
      <Link href="/teacher" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> На главную
      </Link>
      <PageHeader title={`${book.course.name} · ${book.group.name}`} subtitle="Материалы видят все студенты группы: лекции, методички, ссылки." />
      <CourseTabs groupId={groupId} courseId={courseId} active="materials" />
      <AddMaterial groupId={groupId} courseId={courseId} accept={ACCEPT} />
      {items.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="Материалов пока нет" text="Добавьте лекцию, методичку или ссылку — студенты сразу получат уведомление." />
      ) : (
        <ul className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {items.map((m, i) => (
            <li key={m.id} className={`px-4 py-4 sm:px-5 ${i > 0 ? "border-t border-border/60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold leading-snug">{m.title}</div>
                  {m.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{m.description}</p>}
                </div>
                <DeleteMaterial id={m.id} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.url && (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                    <ExternalLink size={14} className="shrink-0" /> <span className="truncate">{new URL(m.url).hostname}</span>
                  </a>
                )}
                {m.files.map((f) => (
                  <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                    <Paperclip size={14} className="shrink-0" /> <span className="truncate">{f.name}</span> <span className="shrink-0 text-muted">{kb(f.size)}</span>
                  </a>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted">Добавлено {fmtDate(m.createdAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
