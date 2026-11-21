import { requireStudent } from "@/server/auth";
import { listRequestTypes } from "@/server/repos/student";
import { getDraftMessage } from "@/server/repos/assistant";
import { PageHeader } from "@/components/ui";
import { parseFields } from "@/lib/request-fields";
import { NewRequestForm } from "./form";
import { listMyDocuments, isUsable } from "@/server/services/documents";
import { studentCourses, typeDocs, typeRoute } from "@/server/services/requests";
import { docKinds } from "@/config/services";
import { situationByCode } from "@/config/situations";
import { prisma } from "@/server/db";

export const metadata = { title: "Новая заявка" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ type?: string; draft?: string; case?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const [types, docs, courses] = await Promise.all([listRequestTypes(), listMyDocuments(student), studentCourses(student.groupId)]);
  // по каждому виду — актуальный действующий документ
  const myDocs: { id: string; kind: string; status: string }[] = [];
  for (const d of docs) if (isUsable(d) && !myDocs.some((x) => x.kind === d.kind)) myDocs.push({ id: d.id, kind: d.kind, status: d.status });

  // Черновик от ИИ-помощника — только из сообщений этого студента
  let draft: { typeCode: string; payload: Record<string, string> } | null = null;
  if (sp.draft) {
    const msg = await getDraftMessage(student, sp.draft);
    const d = msg?.draft as { typeCode?: string; payload?: Record<string, string> } | null;
    if (d?.typeCode) draft = { typeCode: d.typeCode, payload: d.payload ?? {} };
  }
  // из плана жизненной ситуации: поля, заранее известные по ситуации (например, причина «Болезнь»)
  if (!draft && sp.case && sp.type) {
    const c = await prisma.situationCase.findFirst({ where: { id: sp.case, studentId: student.id }, select: { code: true } });
    const step = c && situationByCode(c.code)?.steps.find((s) => s.kind === "request" && s.typeCode === sp.type);
    if (step && step.kind === "request" && step.prefill) draft = { typeCode: sp.type, payload: step.prefill };
  }
  const initialCode = draft?.typeCode ?? sp.type ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Новая заявка" subtitle="Все услуги деканата в одном месте — без очереди и бумажных заявлений" />
      <NewRequestForm
        types={types.map((t) => ({ id: t.id, code: t.code, title: t.title, description: t.description, category: t.category, slaDays: t.slaDays, needsPaper: t.needsPaper, isCertificate: t.isCertificate, fields: parseFields(t.fields), autoIssue: t.autoIssue, docs: typeDocs(t).map((d) => ({ kind: d.kind, title: docKinds[d.kind].title, required: d.required })), route: typeRoute(t).map(() => "Преподаватель дисциплины") }))}
        courses={courses}
        myDocs={myDocs}
        caseId={sp.case ?? null}
        initialCode={initialCode}
        draftPayload={draft?.payload ?? null}
      />
    </div>
  );
}
