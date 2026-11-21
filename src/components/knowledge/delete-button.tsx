"use client";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteDocAction } from "@/app/library-actions";

export function DeleteDocButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm("Удалить материал? Помощник перестанет отвечать по нему.") && start(() => deleteDocAction(id))}
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
    >
      <Trash2 size={16} /> {pending ? "Удаляем…" : "Удалить материал"}
    </button>
  );
}
