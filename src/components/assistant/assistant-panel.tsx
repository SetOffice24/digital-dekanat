"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, BookOpenCheck, CalendarDays, CircleHelp, ClipboardCheck, FileCheck2, Inbox, Megaphone, MessageSquarePlus, PanelLeft, RotateCcw, Stamp, Trash2, UserX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Mascot } from "./mascot";
import { DraftCard } from "./draft-card";
import type { DraftCard as Card } from "@/server/ai/drafts";

type AiLink = { href: string; label: string };
type Msg = { id: string; role: "user" | "assistant"; text: string; draft: Card | null; links?: AiLink[]; pending?: boolean; error?: boolean };
export type AssistantRole = "STUDENT" | "TEACHER" | "STAFF";
type ChatItem = { id: string; title: string; updatedAt: string };

/** Подсказки и подписи — свои для каждой роли. */
const ROLE = {
  STUDENT: {
    hello: (n: string) => `Привет, ${n}!`,
    sub: "Я помощник деканата. Чем помочь?",
    note: "Я вижу только ваши данные: расписание, оценки, заявки и дедлайны.",
    suggestions: [
      { icon: CalendarDays, text: "Какие пары завтра?" },
      { icon: FileCheck2, text: "Нужна справка в банк" },
      { icon: Stamp, text: "Справка для военкомата" },
      { icon: RotateCcw, text: "Как пересдать долг?" },
      { icon: CircleHelp, text: "Что ты умеешь?" },
    ],
  },
  TEACHER: {
    hello: () => "Здравствуйте!",
    sub: "Помогу с расписанием, заданиями и проверкой.",
    note: "Я вижу только ваши пары, группы и задания. Задания выдаёте вы — я готовлю черновик. Оценки не ставлю.",
    suggestions: [
      { icon: CalendarDays, text: "Какие у меня пары завтра?" },
      { icon: BookOpenCheck, text: "Задай ИВТ-24-1 по алгоритмам лабораторную №6 до пятницы" },
      { icon: ClipboardCheck, text: "Что ждёт проверки?" },
      { icon: UserX, text: "Кто не сдал лабораторную №5?" },
      { icon: CircleHelp, text: "Что ты умеешь?" },
    ],
  },
  STAFF: {
    hello: () => "Здравствуйте!",
    sub: "Помогу с заявками, расписанием и объявлениями.",
    note: "Я вижу только студентов и заявки вашей области. Объявления публикуете вы — я готовлю черновик.",
    suggestions: [
      { icon: Inbox, text: "Сколько новых заявок?" },
      { icon: CalendarDays, text: "Пары ИВТ-24-1 завтра" },
      { icon: Megaphone, text: "Объяви ИВТ-24-1: лекция в понедельник переносится в 401" },
      { icon: UserX, text: "Кто из ИВТ-24-1 не входил?" },
      { icon: CircleHelp, text: "Что ты умеешь?" },
    ],
  },
} as const;

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

export function AssistantPanel({ firstName, onClose, mode = "drawer", role = "STUDENT" }: { firstName: string; onClose?: () => void; mode?: "drawer" | "page"; role?: AssistantRole }) {
  const R = ROLE[role];
  const { data: chatData, mutate: refreshChats } = useSWR<{ chats: ChatItem[] }>("/api/assistant/chats", fetcher);
  const chats = useMemo(() => chatData?.chats ?? [], [chatData]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Сайдбар открыт по умолчанию только на широких экранах
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setSidebar(mq.matches);
    const t = setTimeout(apply, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Фигурные скобки обязательны: в новых Chrome scrollIntoView возвращает Promise
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [chatId]);

  // авто-высота поля ввода
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  const openChat = useCallback(
    async (id: string) => {
      if (id === chatId) return;
      setChatId(id);
      setLoadingChat(true);
      if (window.matchMedia("(max-width: 899px)").matches) setSidebar(false);
      try {
        const data = await fetcher(`/api/assistant/chats/${id}`);
        setMsgs(data.messages);
      } catch {
        setMsgs([{ id: "err", role: "assistant", text: "Не удалось открыть чат.", draft: null, error: true }]);
      } finally {
        setLoadingChat(false);
      }
    },
    [chatId],
  );

  const newChat = () => {
    setChatId(null);
    setMsgs([]);
    if (window.matchMedia("(max-width: 899px)").matches) setSidebar(false);
  };

  async function removeChat(id: string) {
    await fetch(`/api/assistant/chats/${id}`, { method: "DELETE" });
    if (id === chatId) newChat();
    refreshChats();
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setBusy(true);
    const tmp = `tmp-${Date.now()}`;
    setMsgs((m) => [...m, { id: tmp + "u", role: "user", text: t, draft: null }, { id: tmp, role: "assistant", text: "", draft: null, pending: true }]);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t, chatId: chatId ?? undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      if (!chatId) setChatId(data.chatId);
      setMsgs((m) => m.map((x) => (x.id === tmp ? { id: data.id, role: "assistant", text: data.text, draft: data.draft, links: data.links } : x)));
      refreshChats();
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tmp ? { ...x, pending: false, error: true, text: (e as Error).message || "Не удалось получить ответ. Попробуйте ещё раз." } : x)));
    } finally {
      setBusy(false);
    }
  }

  // группировка истории по месяцам
  const groups = useMemo(() => {
    const m = new Map<string, ChatItem[]>();
    for (const c of chats) {
      const k = monthFmt.format(new Date(c.updatedAt)).replace(/\s*г\.$/, "");
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [chats]);

  const activeTitle = chats.find((c) => c.id === chatId)?.title;

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {/* ---------- История чатов ---------- */}
      {sidebar && <button className="absolute inset-0 z-10 bg-black/20 min-[900px]:hidden" aria-label="Скрыть историю" onClick={() => setSidebar(false)} />}
      <aside
        className={cn(
          "z-20 flex w-[280px] shrink-0 flex-col border-r border-border bg-surface-2/95 backdrop-blur max-[899px]:absolute max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:shadow-xl",
          sidebar ? "flex" : "hidden",
        )}
        aria-label="История чатов"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <Mascot size={34} />
          <button onClick={() => setSidebar(false)} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-fg" aria-label="Свернуть историю">
            <PanelLeft size={20} />
          </button>
        </div>
        <button onClick={newChat} className="mx-3 mt-2 flex min-h-11 items-center gap-2.5 rounded-2xl px-3 text-[15px] font-semibold hover:bg-surface">
          <MessageSquarePlus size={19} /> Новый чат
        </button>
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          {groups.length === 0 ? (
            <p className="px-3 pt-2 text-xs text-muted">Пока нет чатов</p>
          ) : (
            groups.map(([month, list]) => (
              <div key={month} className="mb-3">
                <p className="px-3 pb-1.5 pt-2 text-xs font-medium capitalize text-muted">{month}</p>
                {list.map((c) => (
                  <div key={c.id} className={cn("group flex items-center rounded-xl", c.id === chatId ? "bg-surface shadow-sm" : "hover:bg-surface/70")}>
                    <button onClick={() => openChat(c.id)} className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm">
                      {c.title}
                    </button>
                    <button onClick={() => removeChat(c.id)} className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={`Удалить чат «${c.title}»`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ---------- Диалог ---------- */}
      <section className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="flex min-h-16 items-center gap-2 px-3 sm:px-4">
          {!sidebar && (
            <button onClick={() => setSidebar(true)} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Показать историю чатов">
              <PanelLeft size={20} />
            </button>
          )}
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">{activeTitle ?? (msgs.length ? "Новый чат" : "")}</div>
          {msgs.length > 0 && (
            <button onClick={newChat} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Новый чат">
              <MessageSquarePlus size={20} />
            </button>
          )}
          {mode === "drawer" && onClose && (
            <button onClick={onClose} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Закрыть помощника">
              <X size={22} />
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6" aria-live="polite">
          {loadingChat ? (
            <div className="mx-auto max-w-3xl space-y-4 py-6">
              <div className="skeleton ml-auto h-10 w-1/2" />
              <div className="skeleton h-16 w-3/4" />
            </div>
          ) : msgs.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
              <Mascot size={112} />
              <p className="mt-4 font-display text-xl font-semibold">{R.hello(firstName)}</p>
              <p className="mt-1 text-sm text-muted">{R.sub}</p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {R.suggestions.map((s) => (
                  <button key={s.text} onClick={() => send(s.text)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium transition hover:bg-primary-soft hover:text-primary">
                    <s.icon size={16} /> {s.text}
                  </button>
                ))}
              </div>
              <p className="mt-6 max-w-sm text-xs text-muted">{R.note}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 py-4">
              {msgs.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-line rounded-[20px] rounded-br-md bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed">{m.text}</p>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <Mascot size={30} thinking={m.pending} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      {m.pending ? (
                        <p className="pt-1.5 text-sm font-semibold text-muted">
                          Анализирую запрос<span className="inline-block w-5 animate-pulse">…</span>
                        </p>
                      ) : (
                        <p className={cn("whitespace-pre-line pt-1 text-[15px] leading-relaxed", m.error && "text-danger")}>{m.text}</p>
                      )}
                      {m.links && m.links.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {m.links.map((l) => (
                            <Link key={l.href + l.label} href={l.href} onClick={onClose} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium hover:border-ink">
                              {l.label} <ArrowUpRight size={14} />
                            </Link>
                          ))}
                        </div>
                      )}
                      {m.draft && <DraftCard messageId={m.id} card={m.draft} onNavigate={onClose} />}
                    </div>
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="px-3 pb-3 pt-2 sm:px-6 sm:pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] bg-surface p-2 pl-4 ring-1 ring-border transition focus-within:ring-2 focus-within:ring-primary/40"
          >
            <label htmlFor={`ai-input-${mode}`} className="sr-only">
              Сообщение помощнику
            </label>
            <textarea
              id={`ai-input-${mode}`}
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Напишите, что нужно…"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted focus-visible:outline-none"
            />
            <button type="submit" disabled={busy || !input.trim()} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-ink-fg transition disabled:opacity-30" aria-label="Отправить">
              <ArrowUp size={20} />
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] text-muted">{role === "STUDENT" ? "Помощник может ошибаться. Важное уточняйте в деканате." : "Помощник может ошибаться — проверяйте черновики перед отправкой."}</p>
        </div>
      </section>
    </div>
  );
}
