import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquarePlus, MessagesSquare, Paperclip, Search } from "lucide-react";
import { listConversations, openConversation, recipients, resolveContext, displayName, type InboxFilter, type Viewer, type ContextType } from "@/server/repos/messages";
import { ACCEPT } from "@/server/files";
import { fileSize } from "@/lib/homework";
import { cn } from "@/lib/utils";
import { AutoRefresh, NewMessageForm, ReplyForm, StatusButton } from "./client";

const time = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" });
const when = (d: Date) => (new Date().toDateString() === d.toDateString() ? time.format(d) : dayMonth.format(d).replace(".", ""));

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "new", label: "Новые" },
  { key: "open", label: "Открытые" },
  { key: "resolved", label: "Решённые" },
  { key: "all", label: "Все" },
];

/** Список диалогов (левая колонка). У деканата — вкладки обращений и поиск. */
async function ConversationList({ v, base, activeId, filter, q }: { v: Viewer; base: string; activeId?: string; filter: InboxFilter; q?: string }) {
  const items = await listConversations(v, filter, q);
  const staff = v.role === "STAFF";
  const link = (f: InboxFilter) => `${base}?${new URLSearchParams({ ...(f !== (staff ? "new" : "all") ? { f } : {}), ...(q ? { q } : {}) })}`;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <h1 className="font-head text-[28px] font-semibold tracking-tight">Сообщения</h1>
        <Link href={`${base}/new`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg hover:opacity-90">
          <MessageSquarePlus size={16} /> Написать
        </Link>
      </div>
      {staff && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {FILTERS.map((x) => (
              <Link key={x.key} href={link(x.key)} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", filter === x.key ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink")}>
                {x.label}
              </Link>
            ))}
          </div>
          <form action={base} className="relative mb-3 px-1">
            <input type="hidden" name="f" value={filter} />
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Фамилия или тема" className="min-h-10 w-full rounded-full border border-border/70 bg-surface pl-9 pr-4 text-sm outline-none focus:border-ink" />
          </form>
        </>
      )}
      {items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-border bg-surface px-5 py-10 text-center text-sm text-muted">
          <MessagesSquare size={22} className="mx-auto mb-2" />
          {staff ? "Здесь пусто." : "Пока нет переписки. Нажмите «Написать», чтобы задать вопрос деканату или преподавателю."}
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/${c.id}${staff && filter !== "new" ? `?f=${filter}` : ""}`} className={cn("block px-4 py-3 transition hover:bg-surface-2/60", activeId === c.id && "bg-surface-2")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("min-w-0 truncate", c.unread || c.awaiting ? "font-semibold" : "font-medium")}>{c.title}</span>
                  <span className="shrink-0 text-xs text-muted">{when(c.lastMessageAt)}</span>
                </div>
                <div className="truncate text-sm">{c.subject}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">
                    {c.lastFromMe ? "Вы: " : ""}
                    {c.preview || "Файл"}
                  </span>
                  {c.status === "RESOLVED" && <span className="shrink-0 text-xs text-muted">решено</span>}
                  {(c.unread || c.awaiting) && <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Новое" />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Экран «Сообщения»: на компьютере список + выбранный диалог, на телефоне — что-то одно. */
export async function MessagesScreen({ v, base, activeId, filter, q, children }: { v: Viewer; base: string; activeId?: string; filter?: string; q?: string; children?: React.ReactNode }) {
  const f: InboxFilter = FILTERS.some((x) => x.key === filter) ? (filter as InboxFilter) : v.role === "STAFF" ? "new" : "all";
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className={cn("min-w-0", children ? "hidden md:block" : "")}>
        <ConversationList v={v} base={base} activeId={activeId} filter={f} q={q} />
      </div>
      <div className={cn("min-w-0", children ? "" : "hidden md:block")}>
        {children ?? (
          <div className="flex h-full min-h-64 items-center justify-center rounded-[28px] border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">Выберите диалог слева или напишите новое сообщение.</div>
        )}
      </div>
      <AutoRefresh />
    </div>
  );
}

/** Переписка. */
export async function Thread({ v, base, id }: { v: Viewer; base: string; id: string }) {
  const data = await openConversation(v, id);
  if (!data) notFound();
  const c = data.conversation;
  const isStaff = v.role === "STAFF";
  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-surface">
      <header className="flex items-start gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <Link href={base} className="-ml-1 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-2 md:hidden" aria-label="К списку">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{data.title}</div>
          <div className="truncate text-sm text-muted">
            {c.subject}
            {data.sub ? ` · ${data.sub}` : ""}
          </div>
          {c.contextLabel && (
            <div className="mt-0.5 text-xs text-muted">
              По поводу:{" "}
              {data.contextHref ? (
                <Link href={data.contextHref} className="font-medium text-fg underline underline-offset-2">
                  {c.contextLabel}
                </Link>
              ) : (
                c.contextLabel
              )}
            </div>
          )}
        </div>
        {isStaff && c.kind === "DEANERY" && <StatusButton id={c.id} status={c.status} />}
        {!isStaff && c.kind === "DEANERY" && c.status === "RESOLVED" && <span className="shrink-0 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">решено</span>}
      </header>
      <ol className="flex-1 space-y-3 px-3 py-4 sm:px-5">
        {c.messages.map((m, i) => {
          const mine = m.authorId === v.id || (isStaff && m.author.role === "STAFF");
          const day = dayMonth.format(m.createdAt);
          // разделитель с датой — перед первым сообщением дня
          const showDay = i === 0 || dayMonth.format(c.messages[i - 1].createdAt) !== day;
          return (
            <li key={m.id}>
              {showDay && <div className="my-2 text-center text-xs text-muted">{day.replace(".", "")}</div>}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-[20px] px-4 py-2.5", mine ? "rounded-br-md bg-ink text-ink-fg" : "rounded-bl-md bg-surface-2")}>
                  {(!mine || (isStaff && m.authorId !== v.id)) && <div className={cn("mb-0.5 text-xs font-semibold", mine ? "text-ink-fg/70" : "text-muted")}>{displayName(m.author)}{m.author.role === "STAFF" && !isStaff ? " · деканат" : ""}</div>}
                  {m.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p>}
                  {m.files.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.files.map((f) => (
                        <a key={f.id} href={`/api/files/${f.id}`} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm", mine ? "bg-white/15" : "bg-surface")}>
                          <Paperclip size={13} className="shrink-0" /> <span className="truncate">{f.name}</span> <span className="shrink-0 opacity-70">{fileSize(f.size)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <div className={cn("mt-1 text-right text-[11px]", mine ? "text-ink-fg/60" : "text-muted")}>{time.format(m.createdAt)}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {data.canReply ? (
        <ReplyForm id={c.id} accept={ACCEPT} />
      ) : (
        <p className="border-t border-border/70 px-4 py-3 text-sm text-muted sm:px-5">Переписка только для чтения: преподаватель больше не ведёт занятия у группы. С вопросами — в деканат.</p>
      )}
    </div>
  );
}

/** Новое сообщение. `to` и повод приходят из кнопок «Написать» (параметры адреса), повод проверяется на сервере. */
export async function NewMessage({ v, base, to, ctxType, ctxId }: { v: Viewer; base: string; to?: string; ctxType?: string; ctxId?: string }) {
  const list = await recipients(v);
  let context: { type: string; id: string; label: string } | null = null;
  let filtered = list;
  if (ctxType && ctxId && ["REQUEST", "COURSE", "ASSIGNMENT"].includes(ctxType)) {
    const ctx = await resolveContext(v, ctxType as ContextType, ctxId);
    if (ctx) {
      context = { type: ctxType, id: ctxId, label: ctx.label };
      // вопрос по дисциплине или заданию — сразу преподавателю этой дисциплины
      if (ctx.teacherUserIds?.length && !to) filtered = list.filter((r) => ctx.teacherUserIds!.includes(r.key) || r.key.startsWith("deanery"));
    }
  }
  const defaultSubject = context ? context.label.charAt(0).toUpperCase() + context.label.slice(1) : undefined;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href={base} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Сообщения
      </Link>
      <h1 className="mb-5 font-head text-[28px] font-semibold tracking-tight">Новое сообщение</h1>
      <NewMessageForm base={base} recipients={filtered} to={to ?? (filtered.length === 2 && filtered[0].key.startsWith("deanery") && ctxType !== "REQUEST" ? filtered[1].key : ctxType === "REQUEST" ? "deanery" : undefined)} context={context} accept={ACCEPT} defaultSubject={defaultSubject} />
    </div>
  );
}
