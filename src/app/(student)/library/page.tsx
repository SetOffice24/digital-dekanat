import { BookOpen } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { listDocs } from "@/server/repos/knowledge";
import { DocRow } from "@/components/knowledge/pages";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { OpenAssistant } from "@/components/assistant/provider";

export const metadata = { title: "Библиотека" };

/** Библиотека студента: материалы деканата и преподавателей его дисциплин. По ним же отвечает помощник. */
export default async function LibraryPage() {
  const { user } = await requireStudent();
  const docs = await listDocs(user);
  const dean = docs.filter((d) => d.scope !== "COURSE");
  const courses = docs.filter((d) => d.scope === "COURSE");
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Библиотека"
        subtitle="Правила, инструкции деканата и требования преподавателей. Не хочется читать — спросите помощника, он найдёт нужный раздел."
        action={
          <OpenAssistant className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-ink-fg">Спросить помощника</OpenAssistant>
        }
      />
      {!docs.length && <EmptyState icon={<BookOpen size={22} />} title="Материалов пока нет" />}
      {dean.length > 0 && (
        <>
          <SectionTitle>От деканата</SectionTitle>
          <div className="space-y-2.5">
            {dean.map((d) => (
              <DocRow key={d.id} d={d} href={`/library/${d.id}`} />
            ))}
          </div>
        </>
      )}
      {courses.length > 0 && (
        <>
          <SectionTitle>По дисциплинам</SectionTitle>
          <div className="space-y-2.5">
            {courses.map((d) => (
              <DocRow key={d.id} d={d} href={`/library/${d.id}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
