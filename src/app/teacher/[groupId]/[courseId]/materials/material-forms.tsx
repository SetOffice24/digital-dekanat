"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui";
import { FileInput } from "@/components/file-input";

export function AddMaterial({ groupId, courseId, accept }: { groupId: string; courseId: string; accept: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg hover:opacity-90">
        <Plus size={17} /> Добавить материал
      </button>
    );

  return (
    <form
      className="mb-6 space-y-3 rounded-[28px] border border-border/70 bg-surface p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("groupId", groupId);
        fd.set("courseId", courseId);
        files.forEach((f) => fd.append("files", f));
        start(async () => {
          setError(null);
          const r = await fetch("/api/teacher/materials", { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return setError(j.error ?? "Не удалось сохранить");
          setOpen(false);
          setFiles([]);
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="m-title">Название</Label>
        <Input id="m-title" name="title" required maxLength={150} placeholder="Например: Лекция 7. Хеш-таблицы" />
      </div>
      <div>
        <Label htmlFor="m-desc">Описание (по желанию)</Label>
        <Textarea id="m-desc" name="description" maxLength={2000} rows={2} placeholder="Что внутри, к какому занятию" />
      </div>
      <div>
        <Label htmlFor="m-url">Ссылка (по желанию)</Label>
        <Input id="m-url" name="url" type="url" maxLength={500} placeholder="https://…" />
      </div>
      <FileInput files={files} onChange={setFiles} accept={accept} />
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-50">
          {pending && <LoaderCircle size={16} className="animate-spin" />} Опубликовать
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:text-fg">
          Отмена
        </button>
      </div>
    </form>
  );
}

export function DeleteMaterial({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Удалить материал"
      onClick={() => {
        if (!window.confirm("Удалить материал? Студенты больше не увидят его и файлы.")) return;
        start(async () => {
          await fetch(`/api/teacher/materials/${id}`, { method: "DELETE" });
          router.refresh();
        });
      }}
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
    >
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  );
}
