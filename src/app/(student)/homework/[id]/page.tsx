import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquareText, Paperclip } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getHomework } from "@/server/repos/homework";
import { ACCEPT, MAX_FILE_MB, MAX_FILES } from "@/server/files";
import { fileSize, hwState } from "@/lib/homework";
import { cn, fmtDateTime } from "@/lib/utils";
import { SubmitHomework } from "./submit-form";

export const metadata = { title: "Домашнее задание" };

export default async function HomeworkItem({ params }: { params: Promise<{ id: string }> }) {
  const { student } = await requireStudent();
  const h = await getHomework(student, (await params).id);
  if (!h) notFound(); // чужое или несуществующее — одинаково
  const s = h.submission;
  const st = hwState[h.state];
  const canSubmit = h.state !== "accepted";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/homework" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Все задания
      </Link>
      <div className="mb-1 text-sm text-muted">
        <Link href={`/courses/${h.course.id}`} className="hover:text-fg hover:underline">
          {h.course.name}
        </Link>{" "}
        · {h.teacher.fullName}
      </div>
      <h1 className="font-head text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">{h.title}</h1>
      <p className="mt-2 text-[15px]">
        Сдать до <b className="font-semibold">{fmtDateTime(h.dueAt)}</b>
      </p>

      {/* Статус — одной плашкой с понятной подсказкой */}
      <div className={cn("mt-4 rounded-2xl px-4 py-3", st.cls)}>
        <div className="font-semibold">{st.label}</div>
        <div className="text-sm opacity-90">{st.hint}</div>
      </div>

      {s?.teacherComment && (
        <div className="mt-3 flex gap-3 rounded-2xl border border-border/70 bg-surface p-4">
          <MessageSquareText size={18} className="mt-0.5 shrink-0 text-muted" />
          <div>
            <div className="text-xs font-semibold text-muted">Комментарий преподавателя</div>
            <p className="mt-0.5 whitespace-pre-line text-[15px]">{s.teacherComment}</p>
          </div>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-[15px] font-bold">Задание</h2>
        <div className="rounded-[28px] border border-border/70 bg-surface p-4 sm:p-5">
          <p className="whitespace-pre-line text-[15px]">{h.description}</p>
          {h.files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {h.files.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                  <Paperclip size={14} className="shrink-0" /> <span className="truncate">{f.name}</span> <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {s && (
        <section className="mt-6">
          <h2 className="mb-2 text-[15px] font-bold">Ваша сдача</h2>
          <div className="rounded-[28px] border border-border/70 bg-surface p-4 sm:p-5">
            <div className="text-sm text-muted">
              Отправлено {fmtDateTime(s.submittedAt)}
              {s.submittedAt > h.dueAt && <span className="font-medium text-warning"> · позже срока</span>}
            </div>
            {s.comment && <p className="mt-1.5 whitespace-pre-line text-[15px]">«{s.comment}»</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {s.files.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border/60">
                  <Paperclip size={14} className="shrink-0" /> <span className="truncate">{f.name}</span> <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {canSubmit && (
        <section className="mt-6">
          <h2 className="mb-2 text-[15px] font-bold">{s ? "Отправить заново" : "Сдать задание"}</h2>
          <SubmitHomework id={h.id} accept={ACCEPT} max={MAX_FILES} maxMb={MAX_FILE_MB} resubmit={Boolean(s)} />
        </section>
      )}
    </div>
  );
}
