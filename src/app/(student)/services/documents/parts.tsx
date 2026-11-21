"use client";
import { useActionState, useState, useTransition } from "react";
import { Eye, Trash2, Upload } from "lucide-react";
import type { DocKind } from "@prisma/client";
import { FormMessage } from "@/components/staff/bits";
import { FilePick } from "@/components/file-pick";
import { deleteDocumentAction, uploadDocumentAction, type ActState } from "../actions";

type K = { kind: DocKind; title: string; expires: boolean; hint: string };

export function UploadDocForm({ kinds, initial, back }: { kinds: K[]; initial: DocKind | null; back?: string }) {
  const [state, action, pending] = useActionState<ActState, FormData>(uploadDocumentAction, {});
  const [kind, setKind] = useState<DocKind>(initial ?? kinds[0].kind);
  const k = kinds.find((x) => x.kind === kind)!;
  return (
    <form action={action} className="space-y-3">
      {back && <input type="hidden" name="back" value={back} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Документ
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className="mt-1 block min-h-12 w-full rounded-2xl border border-border bg-surface px-3 text-[15px]">
            {kinds.map((x) => (
              <option key={x.kind} value={x.kind}>
                {x.title}
              </option>
            ))}
          </select>
        </label>
        {k.expires && (
          <label className="text-sm font-semibold">
            Действует до
            <input type="date" name="validUntil" required className="mt-1 block min-h-12 w-full rounded-2xl border border-border bg-surface px-3 text-[15px]" />
          </label>
        )}
      </div>
      <p className="text-[13px] text-muted">{k.hint}. PDF, JPG или PNG до 10 МБ; с фото убираются метаданные и геометки.</p>
      <FilePick accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
      <FormMessage error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-ink-fg disabled:opacity-50">
        <Upload size={17} /> {pending ? "Загружаем…" : "Загрузить"}
      </button>
    </form>
  );
}

export function DocRowActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 items-center gap-1">
      <a href={`/api/documents/${id}`} target="_blank" rel="noopener" aria-label="Открыть документ" className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
        <Eye size={17} />
      </a>
      <button
        type="button"
        disabled={pending}
        aria-label="Удалить документ"
        onClick={() =>
          confirm("Удалить документ?") &&
          start(async () => {
            const r = await deleteDocumentAction(id);
            setError(r.error ?? null);
          })
        }
        className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={17} />
      </button>
      {error && (
        <span role="alert" className="max-w-48 text-[12px] font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
