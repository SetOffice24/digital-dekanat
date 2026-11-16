import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, ExternalLink, Paperclip } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { prisma } from "@/server/db";
import { listHomework, listMaterialsForStudent } from "@/server/repos/homework";
import { EmptyState, PageHeader } from "@/components/ui";
import { fileSize, hwState } from "@/lib/homework";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Дисциплина" };

/** Дисциплина глазами студента: материалы преподавателя и домашние задания по ней. Только свои дисциплины. */
export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { student } = await requireStudent();
  const { courseId } = await params;
  const enr = await prisma.enrollment.findFirst({ where: { studentId: student.id, courseId }, select: { course: { select: { id: true, name: true } } } });
  if (!enr) notFound();
  const [materials, homework] = await Promise.all([listMaterialsForStudent(student, courseId), listHomework(student)]);
  const hw = homework.filter((h) => h.courseId === courseId).reverse();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/grades" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Учёба
      </Link>
      <PageHeader title={enr.course.name} subtitle="Материалы и домашние задания" />

      {hw.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[15px] font-bold">Домашние задания</h2>
          <div className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
            {hw.map((h) => (
              <Link key={h.id} href={`/homework/${h.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2/60 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug">{h.title}</div>
                  <div className="mt-0.5 text-sm text-muted">до {fmtDateTime(h.dueAt)}</div>
                </div>
                <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", hwState[h.state].cls)}>{hwState[h.state].label}</span>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-2 text-[15px] font-bold">Материалы</h2>
      {materials.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="Материалов пока нет" text="Когда преподаватель добавит лекции или ссылки, они появятся здесь." />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {materials.map((m) => (
            <li key={m.id} className="px-4 py-4 sm:px-5">
              <div className="font-semibold leading-snug">{m.title}</div>
              {m.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{m.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {m.url && (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                    <ExternalLink size={14} className="shrink-0" /> <span className="truncate">{new URL(m.url).hostname}</span>
                  </a>
                )}
                {m.files.map((f) => (
                  <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                    <Paperclip size={14} className="shrink-0" /> <span className="truncate">{f.name}</span> <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
                  </a>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted">
                {m.teacher.fullName} · {fmtDate(m.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
