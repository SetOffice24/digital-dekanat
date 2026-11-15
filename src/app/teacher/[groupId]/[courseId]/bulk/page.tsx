import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getGradebook, MAX_POINTS, WORK_KINDS } from "@/server/repos/teacher";
import { PageHeader } from "@/components/ui";
import { BulkForm } from "./bulk-form";

export const metadata = { title: "Оценки группе" };

export default async function BulkPage({ params }: { params: Promise<{ groupId: string; courseId: string }> }) {
  const { groupId, courseId } = await params;
  const { teacher } = await requireTeacher();
  const book = await getGradebook(teacher, groupId, courseId);
  if (!book) notFound();
  return (
    <>
      <Link href={`/teacher/${groupId}/${courseId}`} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Журнал
      </Link>
      <PageHeader title="Оценки группе" subtitle={`${book.course.name} · ${book.group.name}. Выберите работу и впишите баллы — пустые поля пропустим.`} />
      <BulkForm groupId={groupId} courseId={courseId} kinds={WORK_KINDS} max={MAX_POINTS} rows={book.rows.map((r) => ({ enrollmentId: r.enrollmentId, name: r.name.split(" ").slice(0, 2).join(" "), total: r.total }))} />
    </>
  );
}
