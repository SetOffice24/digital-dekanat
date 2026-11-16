import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { listHomework } from "@/server/repos/homework";
import { EmptyState, PageHeader } from "@/components/ui";
import { hwState } from "@/lib/homework";
import { cn, fmtDateTime, plural } from "@/lib/utils";

export const metadata = { title: "Домашние задания" };

type Item = Awaited<ReturnType<typeof listHomework>>[number];

function Section({ title, list }: { title: string; list: Item[] }) {
  if (!list.length) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[15px] font-bold">{title}</h2>
      <div className="divide-y divide-border/60 overflow-hidden rounded-[28px] border border-border/70 bg-surface">
        {list.map((h) => (
          <Link key={h.id} href={`/homework/${h.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2/60 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-snug">{h.title}</div>
              <div className="mt-0.5 text-sm text-muted">
                {h.course.name} · до {fmtDateTime(h.dueAt)}
              </div>
            </div>
            <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", hwState[h.state].cls)}>{hwState[h.state].label}</span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function HomeworkPage() {
  const { student } = await requireStudent();
  const items = await listHomework(student);
  const todo = items.filter((h) => h.state === "returned" || h.state === "todo" || h.state === "overdue");
  const review = items.filter((h) => h.state === "submitted");
  const done = items.filter((h) => h.state === "accepted").reverse();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/grades" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Учёба
      </Link>
      <PageHeader title="Домашние задания" subtitle={todo.length ? `Нужно сдать: ${todo.length} ${plural(todo.length, "задание", "задания", "заданий")}` : "Все задания сданы"} />
      {items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={22} />} title="Заданий пока нет" text="Когда преподаватель выдаст задание, оно появится здесь, а вам придёт уведомление." />
      ) : (
        <>
          <Section title="Нужно сдать" list={todo} />
          <Section title="На проверке" list={review} />
          <Section title="Принято" list={done} />
        </>
      )}
    </div>
  );
}
