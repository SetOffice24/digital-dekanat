import Link from "next/link";
import type { DocKind } from "@prisma/client";
import { requireStudent } from "@/server/auth";
import { isUsable, listMyDocuments } from "@/server/services/documents";
import { PageHeader } from "@/components/ui";
import { DOC_ORDER, docKinds } from "@/config/services";
import { fmtDate } from "@/lib/utils";
import { DocRowActions, UploadDocForm } from "./parts";

export const metadata = { title: "Мои документы" };

/**
 * «Мои документы»: загрузили один раз — подставляются в любые заявки (заселение, выплаты, пропуски).
 * По каждому виду — актуальный документ, его статус проверки и срок действия.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ kind?: string; back?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const docs = await listMyDocuments(student);
  const latest = new Map<DocKind, (typeof docs)[number]>();
  for (const d of docs) if (!latest.has(d.kind)) latest.set(d.kind, d);
  const focus = sp.kind && sp.kind in docKinds ? (sp.kind as DocKind) : null;
  const back = sp.back?.startsWith("/services/case/") || sp.back?.startsWith("/requests/new") ? sp.back : undefined;
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href={back ?? "/requests"} className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← {back ? "Назад к плану" : "Услуги"}
      </Link>
      <PageHeader title="Мои документы" subtitle="Загрузите один раз — документы подставятся в заявки сами. Видят их только вы и деканат." />

      <section className="mb-6 rounded-[28px] border border-border/70 bg-surface p-5">
        <h2 className="mb-3 font-head text-lg font-semibold">{focus ? `Загрузить: ${docKinds[focus].title}` : "Загрузить документ"}</h2>
        <UploadDocForm kinds={DOC_ORDER.map((k) => ({ kind: k, title: docKinds[k].title, expires: docKinds[k].expires, hint: docKinds[k].hint }))} initial={focus} back={back} />
      </section>

      <ul className="space-y-2">
        {DOC_ORDER.map((k) => {
          const d = latest.get(k);
          const usable = d && isUsable(d);
          const expiring = d?.validUntil && usable && d.validUntil.getTime() - now.getTime() < 14 * 86400000;
          const state = !d ? null : d.status === "REJECTED" ? { t: "не принят", cls: "bg-danger-soft text-danger" } : !usable ? { t: "истёк", cls: "bg-danger-soft text-danger" } : d.status === "VERIFIED" ? { t: "проверен", cls: "bg-success-soft text-success" } : { t: "на проверке", cls: "bg-surface-2 text-muted" };
          return (
            <li key={k} className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-4">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{docKinds[k].title}</span>
                  {state && <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${state.cls}`}>{state.t}</span>}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {!d
                    ? docKinds[k].hint
                    : d.status === "REJECTED"
                      ? `Причина: ${d.reviewNote ?? "—"}`
                      : `Загружен ${fmtDate(d.createdAt)}${d.validUntil ? ` · действует до ${fmtDate(d.validUntil)}` : ""}${d._count.requests ? ` · в заявках: ${d._count.requests}` : ""}`}
                  {expiring && <b className="ml-1 text-warning">— скоро истекает, загрузите новый</b>}
                </span>
              </span>
              {d && <DocRowActions id={d.id} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
