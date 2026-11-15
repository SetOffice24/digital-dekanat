import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import type { RequestStatus } from "@prisma/client";
import { requireStaff } from "@/server/auth";
import { countByStatus, isOverdue, listRequests, listTypes } from "@/server/repos/staff";
import { InboxSearch } from "./inbox-search";
import { cn, dueDate, fmtShort, plural } from "@/lib/utils";
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

export default async function StaffInbox({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; type?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 60);
  const types = await listTypes();
  const typeId = types.some((t) => t.id === sp.type) ? sp.type! : "";
  const filtered = Boolean(q.trim() || typeId);
  const filter = { q, typeId: typeId || undefined };
  const [totals, counts] = await Promise.all([countByStatus(staff), filtered ? countByStatus(staff, filter) : null]);
  const countIn = (c: typeof totals, t: (typeof tabs)[number]) => t.statuses.reduce((a, s) => a + (c[s] ?? 0), 0);
  const count = (t: (typeof tabs)[number]) => countIn(counts ?? totals, t);
  const newTotal = countIn(totals, tabs[0]);
  // без явной вкладки — первая, где что-то есть (при поиске — где нашлось)
  const tab = tabs.find((t) => t.key === sp.tab) ?? tabs.find((t) => count(t) > 0) ?? tabs[0];
  const rows = (await Promise.all(tab.statuses.map((s) => listRequests(staff, { ...filter, status: s })))).flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const now = new Date();
  const found = filtered ? tabs.reduce((a, t) => a + count(t), 0) : 0;
  const tabHref = (key: string) => {
    const p = new URLSearchParams({ tab: key });
    if (q.trim()) p.set("q", q.trim());
    if (typeId) p.set("type", typeId);
    return `/staff?${p}`;
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-head text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">Заявки студентов</h1>
      <p className="mt-2 text-lg text-muted">
        {newTotal > 0 ? (
          <>
            <b className="font-semibold text-fg">
              {newTotal} {plural(newTotal, "новая заявка", "новые заявки", "новых заявок")}
            </b>{" "}
            ждут, чтобы их взяли в работу.
          </>
        ) : (
          <>Новых заявок нет — всё разобрано.</>
        )}
      </p>

      <InboxSearch tab={sp.tab && tabs.some((t) => t.key === sp.tab) ? sp.tab : ""} q={q} type={typeId} types={types} />
      {filtered && (
        <p className="mt-3 text-sm text-muted">
          {found > 0 ? `Найдено: ${found} ${plural(found, "заявка", "заявки", "заявок")} во всех вкладках.` : "Ничего не найдено — проверьте фамилию или номер."}{" "}
          <Link href={sp.tab ? `/staff?tab=${sp.tab}` : "/staff"} className="font-medium text-fg underline underline-offset-2">
            Сбросить
          </Link>
        </p>
      )}

      {/* Шаги работы */}
      {/* Вкладки переносятся на новую строку — на телефоне видны все пять, ничего не прячется за краем */}
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Статусы заявок">
        {tabs.map((t) => {
          const active = t.key === tab.key;
          const n = count(t);
          return (
            <Link key={t.key} href={tabHref(t.key)} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition sm:min-h-11 sm:px-4 sm:text-[15px]", active ? "border-ink bg-ink text-ink-fg" : "border-transparent bg-surface hover:border-border")}>
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
          <p className="font-semibold">{filtered ? "В этой вкладке ничего не нашлось" : "Здесь пусто"}</p>
          <p className="mt-1 text-sm text-muted">{filtered ? "Посмотрите другие вкладки или сбросьте поиск." : "Заявки появятся, как только студенты их отправят."}</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {rows.map((r, i) => {
            const due = dueDate(r.createdAt, r.type.slaDays);
            const overdue = isOverdue(r, now);
            const days = Math.ceil((now.getTime() - due.getTime()) / 86400000);
            const initials = `${r.student.lastName[0]}${r.student.firstName[0]}`;
            const action =
              r.status === "NEW" ? { to: "IN_REVIEW" as const, label: "Взять в работу" } : r.status === "IN_REVIEW" && r.type.isCertificate ? { to: "READY" as const, label: "Справка готова" } : r.status === "READY" ? { to: "DONE" as const, label: "Отметить выданной" } : null;
            return (
              <li key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4 sm:px-5", i > 0 && "border-t border-border/70")}>
                <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-p-sky text-sm font-semibold text-[#0e0e10] sm:flex">{initials}</span>
                <Link href={`/staff/requests/${r.id}`} className="group min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold group-hover:underline sm:truncate">{r.type.title}</span>
                    <span className="shrink-0 text-sm text-muted">№ {r.number}</span>
                  </span>
                  <span className="block text-sm text-muted sm:truncate">
                    {r.student.lastName} {r.student.firstName} · {r.student.group.name}
                    {r.wantsPaper ? " · нужна бумага" : ""}
                  </span>
                  {(r.status === "NEW" || r.status === "IN_REVIEW") && (
                    <span className={cn("mt-1 hidden text-xs font-medium sm:block", overdue ? "text-danger" : "text-muted")}>{overdue ? `Просрочено на ${days} ${plural(days, "день", "дня", "дней")}` : `Срок — до ${fmtShort(due)}`}</span>
                  )}
                </Link>
                {/* на телефоне срок и кнопка — в одной строке под текстом, кнопка компактная справа */}
                {(r.status === "NEW" || r.status === "IN_REVIEW") && (
                  <span className={cn("text-xs font-medium sm:hidden", overdue ? "text-danger" : "text-muted")}>{overdue ? `Просрочено на ${days} ${plural(days, "день", "дня", "дней")}` : `Срок — до ${fmtShort(due)}`}</span>
                )}
                {action ? (
                  <QuickAction id={r.id} to={action.to} label={action.label} />
                ) : (
                  <Link href={`/staff/requests/${r.id}`} className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-border px-4 text-sm font-medium hover:border-ink">
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
