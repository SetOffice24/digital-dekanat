import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getDoc } from "@/server/repos/knowledge";
import { audienceLabel, authorName } from "@/components/knowledge/pages";
import { DocBody } from "@/components/knowledge/doc-body";
import { Card, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Материал библиотеки" };

export default async function LibraryDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireStudent();
  const doc = await getDoc(user, (await params).id);
  if (!doc) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/library" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Библиотека
      </Link>
      <PageHeader title={doc.title} subtitle={`${audienceLabel(doc)} · ${authorName(doc)} · обновлено ${fmtDate(doc.updatedAt)}`} />
      <Card className="sm:p-7">
        <DocBody body={doc.body} />
        {doc.attachment && (
          <a href={`/api/files/${doc.attachment.id}`} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
            <Paperclip size={16} /> Скачать оригинал: {doc.attachment.name}
          </a>
        )}
      </Card>
    </div>
  );
}
