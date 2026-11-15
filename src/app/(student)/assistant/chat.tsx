"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, FileCheck2, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "user" | "assistant"; text: string; draft: { typeCode: string } | null; pending?: boolean; error?: boolean };

const suggestions = ["Нужна справка в банк", "Справка для военкомата", "Как пересдать долг?", "Какие пары завтра?", "Я заболел, что делать?"];

export function Chat({ firstName, initial, typeTitles }: { firstName: string; initial: Msg[]; typeTitles: Record<string, string> }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Фигурные скобки обязательны: в новых Chrome scrollIntoView возвращает Promise,
  // и React принимает его за функцию очистки эффекта → падение страницы.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setBusy(true);
    const tmp = `tmp-${Date.now()}`;
    setMsgs((m) => [...m, { id: tmp + "u", role: "user", text: t, draft: null }, { id: tmp, role: "assistant", text: "", draft: null, pending: true }]);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setMsgs((m) => m.map((x) => (x.id === tmp ? { id: data.id, role: "assistant", text: data.text, draft: data.draft } : x)));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tmp ? { ...x, pending: false, error: true, text: (e as Error).message || "Не удалось получить ответ. Попробуйте ещё раз." } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await fetch("/api/assistant", { method: "DELETE" });
    setMsgs([]);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col" style={{ minHeight: "calc(100dvh - 10rem)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-fg">
            <Sparkles size={20} />
          </span>
          <div>
            <h1 className="font-extrabold leading-tight">Помощник деканата</h1>
            <p className="text-xs text-muted">Отвечает 24/7 и заполняет заявления</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <button onClick={reset} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-muted hover:bg-surface-2" aria-label="Начать заново">
            <RotateCcw size={16} /> <span className="hidden sm:inline">Заново</span>
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="rounded-3xl bg-surface p-5 text-center">
            <p className="font-bold">Здравствуйте, {firstName}!</p>
            <p className="mt-1 text-sm text-muted">Спросите про пары, долги или сроки — или попросите подготовить справку. Я вижу только ваши данные.</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed", m.role === "user" ? "rounded-br-md bg-primary text-primary-fg" : m.error ? "rounded-bl-md bg-danger-soft text-danger" : "rounded-bl-md border border-border bg-surface")}>
              {m.pending ? (
                <span className="flex gap-1 py-1.5" aria-label="Печатает">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              ) : (
                <p className="whitespace-pre-line">{m.text}</p>
              )}
              {m.draft && (
                <Link href={`/requests/new?draft=${m.id}`} className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-primary-soft p-2.5 text-primary hover:opacity-90">
                  <FileCheck2 size={20} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold opacity-80">Черновик заявки</span>
                    <span className="block font-bold">{typeTitles[m.draft.typeCode] ?? "Заявка"}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold">Проверить →</span>
                </Link>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 bg-bg pt-2 lg:bottom-4">
        {msgs.length < 2 && (
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] pb-1">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={busy} className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:border-primary/50">
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(20,24,40,0.04)] ring-1 ring-border/70 p-1.5 focus-within:border-primary"
        >
          <label htmlFor="ai-input" className="sr-only">Сообщение помощнику</label>
          <textarea
            id="ai-input"
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
            placeholder="Например: нужна справка в банк"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg disabled:opacity-40" aria-label="Отправить">
            <ArrowUp size={20} />
          </button>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-muted">Ответы ИИ могут быть неточными — важное уточняйте в деканате.</p>
      </div>
    </div>
  );
}
