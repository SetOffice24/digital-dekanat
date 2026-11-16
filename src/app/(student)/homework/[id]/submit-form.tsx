"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Send } from "lucide-react";
import { FileInput } from "@/components/file-input";

/** Сдача ДЗ: файлы + комментарий → «Отправить». Новая отправка заменяет прежние файлы. */
export function SubmitHomework({ id, accept, max, maxMb, resubmit }: { id: string; accept: string; max: number; maxMb: number; resubmit: boolean }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3 rounded-[28px] border border-border/70 bg-surface p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!files.length) return setError("Прикрепите хотя бы один файл");
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        fd.set("comment", comment);
        start(async () => {
          setError(null);
          setOk(false);
          const r = await fetch(`/api/homework/${id}`, { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return setError(j.error ?? "Не удалось отправить");
          setFiles([]);
          setComment("");
          setOk(true);
          router.refresh();
        });
      }}
    >
      <FileInput files={files} onChange={(f) => { setFiles(f); setError(null); }} accept={accept} max={max} maxMb={maxMb} label="Выбрать файлы с решением" />
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} placeholder="Комментарий преподавателю (по желанию)" className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30" />
      {resubmit && <p className="text-xs text-muted">Новая отправка заменит прежние файлы, задание снова уйдёт на проверку.</p>}
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">{error}</p>}
      {ok && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-2.5 text-sm font-medium text-success">
          <Check size={16} /> Отправлено — задание на проверке
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-50 sm:w-auto">
        {pending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
        {resubmit ? "Отправить заново" : "Отправить на проверку"}
      </button>
    </form>
  );
}
