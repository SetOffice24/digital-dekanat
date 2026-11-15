import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import type { RequestStatus } from "@prisma/client";
import { requireStaff } from "@/server/auth";
import { countByStatus, isOverdue, listRequests } from "@/server/repos/staff";
import { addDays, cn, fmtShort, plural } from "@/lib/utils";
import { QuickAction } from "./quick-action";

export const metadata = { title: "Заявки" };

/**
 * «Входящие» деканата: вкладки по шагам работы и понятное действие в каждой строке.
 * Новые → взять в работу → справка готова → выдана.
 */
const tabs: { key: string; label: string; statuses: RequestStatus[]; hint: string }[] = [
  { key: "new", label: "Новые", statuses: ["NEW"], hint: "Ещё никто не взял в работу" },
  { key: "work", label: "В работе", statuses: ["IN_REVIEW"], hint: "Вы занимаетесь этими заявками" },
  { key: "wait", label: "Ждут студента", statuses: ["NEED_INFO"], hint: "Задали вопрос — ждём ответа" },
  { key: "ready", label: "Готовы к выдаче", statuses: ["READY"], hint: "Осталось выдать или отметить выданными" },
  { key: "done", label: "Архив", statuses: ["DONE", "REJECTED"], hint: "Завершённые" },
];

export default async function StaffInbox({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const counts = await countByStatus(staff);
  const count = (t: (typeof tabs)[number]) => t.statuses.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const tab = tabs.find((t) => t.key === sp.tab) ?? (count(tabs[0]) ? tabs[0] : tabs[1]);
  const rows = (await Promise.all(tab.statuses.map((s) => listRequests(staff, { status: s })))).flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-head text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">Заявки студентов</h1>
      <p className="mt-2 text-lg text-muted">
        {count(tabs[0]) > 0 ? (
          <>
            <b className="font-semibold text-fg">
              {count(tabs[0])} {plural(count(tabs[0]), "новая заявка", "новые заявки", "новых заявок")}
            </b>{" "}
            ждут, чтобы их взяли в работу.
          </>
        ) : (
          <>Новых заявок нет — всё разобрано.</>
        )}
      </p>

      {/* Шаги работы */}
      <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Статусы заявок">
        {tabs.map((t) => {
          const active = t.key === tab.key;
          const n = count(t);
          return (
            <Link key={t.key} href={`/staff?tab=${t.key}`} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition", active ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
              {t.label}
              {n > 0 && <span className={cn("rounded-full px-2 text-xs font-semibold leading-5", active ? "bg-white/20" : t.key === "new" ? "bg-p-yellow text-[#0e0e10]" : "bg-surface-2 text-muted")}>{n}</span>}
            </Link>
          );
        })}
      </nav>
      <p className="mb-4 mt-3 text-sm text-muted">{tab.hint}</p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-[28px] border border-dashed border-border bg-surface px-6 py-14 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-p-mint text-[#0e0e10]">
            <Inbox size={22} />
          </span>
          <p className="font-semibold">Здесь пусто</p>
          <p className="mt-1 text-sm text-muted">Заявки появятся, как только студенты их отправят.</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {rows.map((r, i) => {
            const due = addDays(r.createdAt, r.type.slaDays);
            const overdue = isOverdue(r, now);
            const days = Math.ceil((now.getTime() - due.getTime()) / 86400000);
            const initials = `${r.student.lastName[0]}${r.student.firstName[0]}`;
            const action =
              r.status === "NEW" ? { to: "IN_REVIEW" as const, label: "Взять в работу" } : r.status === "IN_REVIEW" && r.type.isCertificate ? { to: "READY" as const, label: "Справка готова" } : r.status === "READY" ? { to: "DONE" as const, label: "Выдана" } : null;
            return (
              <li key={r.id} className={cn("flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5", i > 0 && "border-t border-border/70")}>
                <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-p-sky text-sm font-semibold text-[#0e0e10] sm:flex">{initials}</span>
                <Link href={`/staff/requests/${r.id}`} className="group min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-semibold group-hover:underline">{r.type.title}</span>
                    <span className="shrink-0 text-sm text-muted">№ {r.number}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {r.student.lastName} {r.student.firstName} · {r.student.group.name}
                    {r.wantsPaper ? " · нужна бумага" : ""}
                  </span>
                  {(r.status === "NEW" || r.status === "IN_REVIEW") && (
                    <span className={cn("mt-1 block text-xs font-medium", overdue ? "text-danger" : "text-muted")}>{overdue ? `Просрочено на ${days} ${plural(days, "день", "дня", "дней")}` : `Срок — до ${fmtShort(due)}`}</span>
                  )}
                </Link>
                {action ? (
                  <QuickAction id={r.id} to={action.to} label={action.label} />
                ) : (
                  <Link href={`/staff/requests/${r.id}`} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-border px-4 text-sm font-medium hover:border-ink">
                    Открыть <ArrowUpRight size={15} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
