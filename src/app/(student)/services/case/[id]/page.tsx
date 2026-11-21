import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, Circle, FileText } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getCase } from "@/server/services/situations";
import { prisma } from "@/server/db";
import { situationIcon } from "@/components/services/icons";
import { PageHeader, Progress } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { CaseFooter, NotifyTeachersForm, ReadButton } from "./parts";

export const metadata = { title: "План по ситуации" };

/** План по жизненной ситуации: шаги в деканате и у преподавателей, состояние — по данным, кнопка ведёт прямо к действию. */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { student } = await requireStudent();
  const c = await getCase(student, (await params).id);
  if (!c) notFound();
  const Icon = situationIcon[c.code] ?? FileText;
  // «прочитать» — ссылка на материал библиотеки с этим названием
  const titles = c.situation.steps.flatMap((s) => (s.kind === "read" ? [s.libraryTitle] : []));
  const lib = titles.length ? await prisma.knowledgeDoc.findMany({ where: { title: { in: titles }, scope: "UNIVERSITY" }, select: { id: true, title: true } }) : [];
  const open = c.status === "OPEN";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/requests" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Услуги
      </Link>
      <PageHeader title={c.situation.title} subtitle={c.situation.intro} />
      <div className="mb-6 flex items-center gap-3 rounded-[24px] border border-border/70 bg-surface p-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-[#0e0e10]", c.situation.tone)}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{c.status === "OPEN" ? (c.complete ? "Готово — можно завершить" : "Выполнено обязательных шагов") : c.status === "DONE" ? "Завершено" : "Отменено"}</span>
            <span className="tabular-nums text-muted">
              {c.progress.done} из {c.progress.total} · начат {fmtDate(c.createdAt)}
            </span>
          </div>
          <div className="mt-2">
            <Progress value={(c.progress.done / Math.max(1, c.progress.total)) * 100} tone={c.complete ? "success" : "primary"} />
          </div>
        </div>
      </div>

      <ol className="space-y-2.5">
        {c.steps.map((s, i) => {
          const libDoc = s.kind === "read" ? lib.find((d) => d.title === (c.situation.steps[i] as { libraryTitle: string }).libraryTitle) : null;
          return (
            <li key={s.key} className={cn("rounded-[24px] border bg-surface p-4", s.done ? "border-success/30" : "border-border/70")}>
              <div className="flex gap-3">
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", s.done ? "bg-success text-white" : "border-2 border-border text-muted")}>
                  {s.done ? <Check size={16} /> : <Circle size={0} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{s.title}</span>
                    {s.optional && <span className="text-[13px] text-muted">по желанию</span>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{s.status ? <span className="font-medium text-fg">{s.status}</span> : s.hint}</p>
                  {open && (
                    <div className="mt-2.5">
                      {s.kind === "notifyTeachers" ? (
                        !s.done && <NotifyTeachersForm caseId={c.id} />
                      ) : s.kind === "read" ? (
                        <div className="flex flex-wrap gap-2">
                          {libDoc && (
                            <Link href={`/library/${libDoc.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:border-ink">
                              Читать <ArrowUpRight size={14} />
                            </Link>
                          )}
                          {!s.done && <ReadButton caseId={c.id} stepKey={s.key} />}
                        </div>
                      ) : (
                        s.href && (
                          <Link href={s.href} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold", s.done ? "border border-border hover:border-ink" : "bg-ink text-ink-fg hover:opacity-90")}>
                            {s.action} <ArrowUpRight size={14} />
                          </Link>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {open && <CaseFooter caseId={c.id} complete={c.complete} />}
    </div>
  );
}
