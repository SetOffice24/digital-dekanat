"use client";
import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";

/** Выбор одного файла: кнопка «Выбрать файл» и рядом — имя файла или «Файл не выбран». Поле остаётся настоящим input (форма и проверка браузера работают как обычно). */
export function FilePick({ name = "file", accept, required }: { name?: string; accept: string; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2/50 p-2.5">
      <input ref={ref} name={name} type="file" accept={accept} required={required} onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} className="sr-only" id={`pick-${name}`} />
      <label htmlFor={`pick-${name}`} className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg">
        <Paperclip size={15} /> {file ? "Другой файл" : "Выбрать файл"}
      </label>
      <span className={file ? "min-w-0 truncate text-sm font-medium" : "text-sm text-muted"} title={file ?? undefined}>
        {file ?? "Файл не выбран"}
      </span>
    </div>
  );
}
