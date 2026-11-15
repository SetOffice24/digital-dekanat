"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type T = { id: string; title: string };

/**
 * Поиск во «входящих»: фамилия, группа или номер заявки + фильтр по типу.
 * Результаты обновляются на лету (через 300 мс после ввода), без кнопки «Найти».
 */
export function InboxSearch({ tab, q, type, types }: { tab: string; q: string; type: string; types: T[] }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, start] = useTransition();
  const first = useRef(true);
  // «Сбросить» и переходы по ссылкам меняют q снаружи — подтягиваем его в поле
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    if (q.trim() !== value.trim()) setValue(q);
  }

  const go = (nextQ: string, nextType: string) => {
    const p = new URLSearchParams();
    if (tab) p.set("tab", tab);
    if (nextQ.trim()) p.set("q", nextQ.trim());
    if (nextType) p.set("type", nextType);
    const qs = p.toString();
    start(() => router.replace(qs ? `/staff?${qs}` : "/staff", { scroll: false }));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => go(value, type), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
      <label className="relative flex-1">
        <span className="sr-only">Поиск по заявкам</span>
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">{pending ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}</span>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Фамилия, группа или № заявки"
          className="min-h-12 w-full rounded-full border border-border/70 bg-surface pl-11 pr-11 text-[15px] outline-none transition placeholder:text-muted focus:border-ink [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button type="button" onClick={() => setValue("")} aria-label="Очистить поиск" className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
            <X size={16} />
          </button>
        )}
      </label>
      <label className="sm:w-64">
        <span className="sr-only">Тип заявки</span>
        <select
          value={type}
          onChange={(e) => go(value, e.target.value)}
          className={cn("min-h-12 w-full appearance-none rounded-full border border-border/70 bg-surface bg-[length:16px] bg-[right_16px_center] bg-no-repeat pl-4 pr-10 text-[15px] outline-none focus:border-ink", type && "border-ink font-medium")}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7180' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        >
          <option value="">Все типы заявок</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
