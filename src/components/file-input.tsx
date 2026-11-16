"use client";
import { useRef } from "react";
import { FileUp, Paperclip, X } from "lucide-react";

export const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`);

/** Выбор файлов: кнопка + список выбранных с размером и удалением. Проверка формата/размера — на сервере. */
export function FileInput({ files, onChange, accept, max = 5, maxMb = 10, label = "Прикрепить файлы" }: { files: File[]; onChange: (f: File[]) => void; accept: string; max?: number; maxMb?: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          onChange([...files, ...picked].slice(0, max));
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <Paperclip size={15} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className={f.size > maxMb * 1024 * 1024 ? "shrink-0 font-medium text-danger" : "shrink-0 text-muted"}>{fmtSize(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Убрать ${f.name}`} className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <button type="button" onClick={() => ref.current?.click()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-4 text-sm font-semibold text-muted transition hover:border-ink hover:text-fg">
          <FileUp size={17} /> {label}
        </button>
      )}
      <p className="mt-1.5 text-xs text-muted">
        До {max} файлов, каждый до {maxMb} МБ: PDF, Word, Excel, PowerPoint, текст, код, архив ZIP, изображения.
      </p>
    </div>
  );
}
