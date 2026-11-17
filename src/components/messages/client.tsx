"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Paperclip, RotateCcw, Search, Send } from "lucide-react";
import { FileInput } from "@/components/file-input";
import { cn } from "@/lib/utils";

/** Подтягивать новые сообщения без перезагрузки: обновление каждые 8 с, пока вкладка видна. */
export function AutoRefresh({ ms = 8000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}

/** Поле ответа: текст + файлы, Ctrl/⌘+Enter — отправить. */
export function ReplyForm({ id, accept }: { id: string; accept: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => {
    if (!body.trim() && !files.length) return;
    const fd = new FormData();
    fd.set("body", body);
    files.forEach((f) => fd.append("files", f));
    start(async () => {
      setError(null);
      const r = await fetch(`/api/messages/${id}`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? "Не удалось отправить");
      setBody("");
      setFiles([]);
      setShowFiles(false);
      router.refresh();
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="sticky bottom-0 border-t border-border/70 bg-bg/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-4"
    >
      {showFiles && (
        <div className="mb-2">
          <FileInput files={files} onChange={setFiles} accept={accept} />
        </div>
      )}
      {error && <p className="mb-2 text-sm font-medium text-danger">{error}</p>}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => setShowFiles((s) => !s)} className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border", showFiles || files.length ? "border-ink" : "border-border")} aria-label="Прикрепить файлы" title="Прикрепить файлы">
          <Paperclip size={18} />
        </button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Сообщение…"
          aria-label="Сообщение"
          className="max-h-40 min-h-11 flex-1 resize-y rounded-2xl bg-surface px-4 py-2.5 text-[15px] outline-none ring-1 ring-border/70 focus:ring-2 focus:ring-ink/30"
        />
        <button type="submit" disabled={pending || (!body.trim() && !files.length)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-ink-fg disabled:opacity-40" aria-label="Отправить">
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <p className="mt-1 hidden text-[11px] text-muted sm:block">Ctrl + Enter — отправить</p>
    </form>
  );
}

/** Деканат: «Решено» / «Открыть снова». */
export function StatusButton({ id, status }: { id: string; status: "OPEN" | "RESOLVED" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = status === "OPEN" ? "RESOLVED" : "OPEN";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch(`/api/messages/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
          router.refresh();
        })
      }
      className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold disabled:opacity-50", status === "OPEN" ? "bg-ink text-ink-fg" : "border border-border")}
    >
      {pending ? <LoaderCircle size={15} className="animate-spin" /> : status === "OPEN" ? <Check size={15} /> : <RotateCcw size={15} />}
      {status === "OPEN" ? "Решено" : "Открыть снова"}
    </button>
  );
}

type Recipient = { key: string; title: string; sub: string };

/** Новое сообщение: выбор адресата (поиск), тема, текст, файлы. Адресат и повод могут прийти из кнопки «Написать». */
export function NewMessageForm({ base, recipients, to, context, accept, defaultSubject }: { base: string; recipients: Recipient[]; to?: string; context?: { type: string; id: string; label: string } | null; accept: string; defaultSubject?: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | undefined>(recipients.some((r) => r.key === to) ? to : recipients.length === 1 ? recipients[0].key : undefined);
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? recipients.filter((r) => `${r.title} ${r.sub}`.toLowerCase().includes(n)) : recipients).slice(0, 60);
  }, [q, recipients]);
  const chosen = recipients.find((r) => r.key === picked);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked) return setError("Выберите, кому написать");
        const fd = new FormData();
        fd.set("to", picked);
        fd.set("subject", subject);
        fd.set("body", body);
        if (context) {
          fd.set("contextType", context.type);
          fd.set("contextId", context.id);
        }
        files.forEach((f) => fd.append("files", f));
        start(async () => {
          setError(null);
          const r = await fetch("/api/messages", { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return setError(j.error ?? "Не удалось отправить");
          router.push(`${base}/${j.id}`);
        });
      }}
    >
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-muted">Кому</div>
        {chosen ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-ink bg-surface px-4 py-3">
            <span className="min-w-0">
              <span className="block font-semibold">{chosen.title}</span>
              <span className="block truncate text-sm text-muted">{chosen.sub}</span>
            </span>
            {recipients.length > 1 && (
              <button type="button" onClick={() => setPicked(undefined)} className="shrink-0 text-sm font-semibold text-muted underline underline-offset-2 hover:text-fg">
                изменить
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-surface p-2">
            {recipients.length > 6 && (
              <label className="relative mb-2 block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия, группа…" className="min-h-11 w-full rounded-xl bg-surface-2 pl-9 pr-3 text-[15px] outline-none" />
              </label>
            )}
            <ul className="max-h-72 overflow-y-auto">
              {list.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => setPicked(r.key)} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block truncate text-sm text-muted">{r.sub}</span>
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">Никого не нашлось</li>}
            </ul>
          </div>
        )}
      </div>
      {context && <p className="rounded-2xl bg-surface-2 px-4 py-2.5 text-sm">Повод: {context.label}</p>}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Тема</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required placeholder="Коротко, о чём вопрос" className="min-h-12 w-full rounded-2xl bg-surface px-4 text-[15px] outline-none ring-1 ring-border/70 focus:ring-2 focus:ring-ink/30" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Сообщение</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} placeholder="Опишите вопрос" className="w-full rounded-2xl bg-surface px-4 py-3 text-[15px] outline-none ring-1 ring-border/70 focus:ring-2 focus:ring-ink/30" />
      </label>
      <FileInput files={files} onChange={setFiles} accept={accept} />
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">{error}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-ink-fg disabled:opacity-50 sm:w-auto">
        {pending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />} Отправить
      </button>
    </form>
  );
}
