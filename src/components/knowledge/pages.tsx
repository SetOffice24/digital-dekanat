import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, FileText, Paperclip } from "lucide-react";
import type { User, Staff, Teacher, Student } from "@prisma/client";
import { getDoc, listDocs, teacherTargets, type DocListItem } from "@/server/repos/knowledge";
import { prisma } from "@/server/db";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { DocForm } from "./doc-form";
import { DocBody } from "./doc-body";
import { SearchPreview } from "./search-preview";
import { DeleteDocButton } from "./delete-button";

type Author = User & { staff: Staff | null; teacher: Teacher | null; student: Student | null };

export const audienceLabel = (d: Pick<DocListItem, "scope" | "faculty" | "course" | "groupName">) =>
  d.scope === "UNIVERSITY" ? "Весь вуз" : d.scope === "FACULTY" ? `Факультет ${d.faculty?.shortName ?? ""}` : `${d.course?.name ?? ""} · ${d.groupName ?? "все группы"}`;
export const authorName = (d: Pick<DocListItem, "author">) => d.author.staff?.fullName ?? d.author.teacher?.fullName ?? "";

/** Строка списка материалов. */
export function DocRow({ d, href }: { d: DocListItem; href: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3.5 rounded-[24px] border border-border/70 bg-surface p-4 transition hover:border-ink/40">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">{d.attachment ? <Paperclip size={18} /> : <FileText size={18} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{d.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <Badge tone="primary" className="max-w-full whitespace-normal">{audienceLabel(d)}</Badge>
          <span>
            {authorName(d)} · {fmtDate(d.updatedAt)}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Раздел «Библиотека» у деканата и преподавателя: свои материалы, добавление, проверка поиска. */
export async function LibraryIndex({ user, base }: { user: Author; base: string }) {
  const role = user.role === "STAFF" ? "STAFF" : "TEACHER";
  const [docs, faculties, targets] = await Promise.all([
    listDocs(user, { mine: true }),
    role === "STAFF" && !user.staff?.facultyId ? prisma.faculty.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    role === "TEACHER" && user.teacher ? teacherTargets(user.teacher.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Библиотека" subtitle="Положения, инструкции и требования. Помощник отвечает по ним студентам — с цитатой и ссылкой на источник." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="order-2 min-w-0 lg:order-1">
          <SectionTitle>{role === "STAFF" ? "Материалы деканата" : "Мои материалы"}</SectionTitle>
          {docs.length ? (
            <div className="space-y-2.5">
              {docs.map((d) => (
                <DocRow key={d.id} d={d} href={`${base}/${d.id}`} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<BookOpen size={22} />} title="Материалов пока нет" text="Добавьте первый — и помощник начнёт отвечать студентам по нему." />
          )}
          <SectionTitle>Как ответит помощник</SectionTitle>
          <Card>
            <SearchPreview base={base} />
          </Card>
        </div>
        <Card className="order-1 h-fit min-w-0 lg:order-2">
          <SectionTitle>Новый материал</SectionTitle>
          {role === "TEACHER" && !targets.length ? (
            <p className="text-sm text-muted">У вас пока нет дисциплин в расписании.</p>
          ) : (
            <DocForm role={role} faculties={faculties} staffFacultyId={user.staff?.facultyId ?? null} targets={targets} />
          )}
        </Card>
      </div>
    </>
  );
}

/** Материал: правка (если можно) и текст, как его видит помощник. */
export async function LibraryDoc({ user, base, id, fresh }: { user: Author; base: string; id: string; fresh: boolean }) {
  const doc = await getDoc(user, id);
  if (!doc) notFound();
  const role = user.role === "STAFF" ? "STAFF" : "TEACHER";
  const [faculties, targets] = await Promise.all([
    role === "STAFF" && !user.staff?.facultyId ? prisma.faculty.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    role === "TEACHER" && user.teacher ? teacherTargets(user.teacher.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <Link href={base} className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Библиотека
      </Link>
      <PageHeader title={doc.title} subtitle={`${audienceLabel(doc)} · ${authorName(doc)} · ${fmtDate(doc.updatedAt)}`} />
      {fresh && doc.attachment && (
        <p role="status" className="mb-4 rounded-2xl bg-info-soft px-4 py-3 text-sm font-medium text-info">
          Текст извлечён из файла «{doc.attachment.name}». Проверьте его: уберите колонтитулы и лишнее — помощник цитирует именно этот текст.
        </p>
      )}
      {doc.editable ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <DocForm role={role} faculties={faculties} staffFacultyId={user.staff?.facultyId ?? null} targets={targets} doc={{ id: doc.id, title: doc.title, body: doc.body, scope: doc.scope, facultyId: doc.facultyId, courseId: doc.courseId, groupId: doc.groupId }} />
          </Card>
          <div className="space-y-4">
            <Card>
              <p className="text-sm text-muted">Разделов для поиска: <b className="text-fg">{doc._count.chunks}</b></p>
              {doc.attachment && (
                <a href={`/api/files/${doc.attachment.id}`} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
                  <Paperclip size={16} /> Исходный файл: {doc.attachment.name}
                </a>
              )}
            </Card>
            <DeleteDocButton id={doc.id} />
          </div>
        </div>
      ) : (
        <Card>
          <DocBody body={doc.body} />
        </Card>
      )}
    </>
  );
}
