import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { getAssignmentForTeacher } from "@/server/repos/homework";
import { PageHeader } from "@/components/ui";
import { cn, fmtDateTime } from "@/lib/utils";
import { ReviewControls } from "./review";

export const metadata = { title: "Проверка задания" };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1048576).toFixed(1).replace(".", ",")} МБ`);
const STATUS = {
  SUBMITTED: { label: "На проверке", cls: "bg-p-yellow text-[#0e0e10]" },
  RETURNED: { label: "На доработке", cls: "bg-warning-soft text-warning" },
  ACCEPTED: { label: "Принято", cls: "bg-success-soft text-success" },
} as const;

export default async function ReviewPage({ params }: { params: Promise<{ groupId: string; courseId: string; assignmentId: string }> }) {
  const { groupId, courseId, assignmentId } = await params;
  const { teacher } = await requireTeacher();
  const data = await getAssignmentForTeacher(teacher, assignmentId);
  if (!data || data.assignment.groupId !== groupId || data.assignment.courseId !== courseId) notFound();
  const { assignment: a, rows } = data;
  // сначала — то, что ждёт проверки, потом не сданное, потом на доработке и принятое
  const order = { SUBMITTED: 0, RETURNED: 2, ACCEPTED: 3 } as const;
  const sorted = [...rows].sort((x, y) => (x.submission ? order[x.submission.status] : 1) - (y.submission ? order[y.submission.status] : 1));
  const submitted = rows.filter((r) => r.submission).length;
  const now = new Date();

  return (
    <>
      <Link href={`/teacher/${groupId}/${courseId}/homework`} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Все задания
      </Link>
      <PageHeader title={a.title} subtitle={`${a.course.name} · ${a.group.name} · срок ${fmtDateTime(a.dueAt)} · сдали ${submitted} из ${rows.length}`} />
      <section className="mb-6 rounded-[28px] border border-border/70 bg-surface p-4 sm:p-5">
        <p className="whitespace-pre-line text-[15px]">{a.description}</p>
        {a.files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {a.files.map((f) => (
              <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                <Paperclip size={14} /> {f.name}
              </a>
            ))}
          </div>
        )}
      </section>

      <ul className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
        {sorted.map((r, i) => {
          const s = r.submission;
          return (
            <li key={r.studentId} className={cn("px-4 py-4 sm:px-5", i > 0 && "border-t border-border/60")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">
                  {r.name}
                  {r.movedTo && <span className="ml-2 text-xs font-normal text-muted">переведён(а) в {r.movedTo}</span>}
                </div>
                {s ? (
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", STATUS[s.status].cls)}>{STATUS[s.status].label}</span>
                ) : (
                  <span className="text-sm text-muted">{a.dueAt < now ? "Не сдано, срок прошёл" : "Ещё не сдано"}</span>
                )}
              </div>
              {s && (
                <>
                  <div className="mt-1 text-sm text-muted">
                    Сдано {fmtDateTime(s.submittedAt)}
                    {s.submittedAt > a.dueAt && <span className="font-medium text-warning"> · позже срока</span>}
                  </div>
                  {s.comment && <p className="mt-1.5 whitespace-pre-line rounded-xl bg-surface-2 px-3 py-2 text-sm">«{s.comment}»</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.files.map((f) => (
                      <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                        <Paperclip size={14} className="shrink-0" /> <span className="truncate">{f.name}</span> <span className="shrink-0 text-muted">{kb(f.size)}</span>
                      </a>
                    ))}
                  </div>
                  {s.teacherComment && s.status !== "SUBMITTED" && <p className="mt-2 text-sm text-muted">Ваш комментарий: {s.teacherComment}</p>}
                  <ReviewControls submissionId={s.id} version={s.version} status={s.status} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
