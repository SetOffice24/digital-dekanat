"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui";
import { FileInput } from "@/components/file-input";

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(d);
};

/** Выдать задание: название, описание, срок (по умолчанию через неделю, 23:59), файлы по желанию. */
export function CreateAssignment({ groupId, courseId, accept }: { groupId: string; courseId: string; accept: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg hover:opacity-90">
        <Plus size={17} /> Выдать задание
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
          const r = await fetch("/api/teacher/assignments", { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return setError(j.error ?? "Не удалось выдать задание");
          setOpen(false);
          setFiles([]);
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="a-title">Название</Label>
        <Input id="a-title" name="title" required maxLength={150} placeholder="Например: Лабораторная №5. Хеш-таблица" />
      </div>
      <div>
        <Label htmlFor="a-desc">Что сделать</Label>
        <Textarea id="a-desc" name="description" required maxLength={4000} rows={4} placeholder="Условие, требования к оформлению, что прислать" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
        <div>
          <Label htmlFor="a-date">Сдать до</Label>
          <Input id="a-date" name="dueDate" type="date" required defaultValue={inDays(7)} min={inDays(0)} />
        </div>
        <div>
          <Label htmlFor="a-time">Время</Label>
          <Input id="a-time" name="dueTime" type="time" required defaultValue="23:59" />
        </div>
      </div>
      <FileInput files={files} onChange={setFiles} accept={accept} label="Прикрепить условие или шаблон" />
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-50">
          {pending && <LoaderCircle size={16} className="animate-spin" />} Выдать и уведомить группу
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:text-fg">
          Отмена
        </button>
      </div>
    </form>
  );
}
