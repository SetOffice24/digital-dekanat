"use client";
import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { FormMessage } from "@/components/staff/bits";
import { replaceRequestDocumentAction, type ActState } from "../../services/actions";

/** «Загрузить новую версию» для документа, который деканат не принял, — прямо в этой заявке. */
export function ReplaceDocForm({ requestId, docId, expires }: { requestId: string; docId: string; expires: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActState, FormData>(replaceRequestDocumentAction.bind(null, requestId, docId), {});
  if (state.ok) return <FormMessage ok={state.ok} />;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg">
        <Upload size={15} /> Заменить в этой заявке
      </button>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required className="block w-full text-sm" />
      {expires && (
        <label className="block text-sm">
          <span className="text-muted">Действует до</span>
          <input type="date" name="validUntil" required className="mt-1 block min-h-10 rounded-xl border border-border px-3" />
        </label>
      )}
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-50">
          {pending ? "Загружаем…" : "Отправить новую версию"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-full px-3 text-sm font-semibold text-muted">
          Отмена
        </button>
      </div>
    </form>
  );
}
