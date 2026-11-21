"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { previewSearchAction } from "@/app/library-actions";

type Hit = Awaited<ReturnType<typeof previewSearchAction>>[number];

/** «Как ответит помощник»: автор задаёт вопрос студента и видит, какой фрагмент библиотеки найдётся. */
export function SearchPreview({ base }: { base: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [pending, start] = useTransition();
  const run = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => setHits(await previewSearchAction(q)));
  };
  return (
    <div>
      <form onSubmit={run} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Вопрос студента, например «сколько раз можно пересдавать»" className="min-h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-sm outline-none focus:border-ink" />
        <button type="submit" disabled={pending || q.trim().length < 3} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-ink-fg disabled:opacity-40" aria-label="Проверить">
          <Search size={18} />
        </button>
      </form>
      {hits && (
        <div className="mt-3 space-y-2">
          {!hits.length && <p className="text-sm text-muted">Ничего не нашлось — помощник ответит, что в библиотеке этого нет. Добавьте материал или раздел.</p>}
          {hits.map((h, i) => (
            <Link key={i} href={`${base}/${h.docId}`} className="block rounded-2xl border border-border/70 p-3 transition hover:border-ink/40">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <span className={h.strong ? "text-success" : "text-muted"}>{h.strong ? "Ответит этим" : "Похоже частично"}</span>
                <span className="truncate text-muted">· {h.title}{h.heading ? ` → ${h.heading}` : ""}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{h.excerpt}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
