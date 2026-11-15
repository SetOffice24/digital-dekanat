import { requireStudent } from "@/server/auth";
import { listRequestTypes } from "@/server/repos/student";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { parseFields } from "@/lib/request-fields";
import { NewRequestForm } from "./form";

export const metadata = { title: "Новая заявка" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ type?: string; draft?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const types = await listRequestTypes();

  // Черновик от ИИ-помощника — только из сообщений этого студента
  let draft: { typeCode: string; payload: Record<string, string> } | null = null;
  if (sp.draft) {
    const msg = await prisma.aiMessage.findFirst({ where: { id: sp.draft, studentId: student.id }, select: { draft: true } });
    const d = msg?.draft as { typeCode?: string; payload?: Record<string, string> } | null;
    if (d?.typeCode) draft = { typeCode: d.typeCode, payload: d.payload ?? {} };
  }
  const initialCode = draft?.typeCode ?? sp.type ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Новая заявка" subtitle="Выберите, что нужно — деканат увидит заявку сразу" />
      <NewRequestForm
        types={types.map((t) => ({ id: t.id, code: t.code, title: t.title, description: t.description, category: t.category, slaDays: t.slaDays, needsPaper: t.needsPaper, isCertificate: t.isCertificate, fields: parseFields(t.fields) }))}
        initialCode={initialCode}
        draftPayload={draft?.payload ?? null}
      />
    </div>
  );
}
