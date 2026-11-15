"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import type { ComponentProps } from "react";

/** Кнопка отправки: блокируется, пока форма отправляется. */
export function SubmitButton({ children, pendingText = "Сохраняем…", ...p }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...p} disabled={pending || p.disabled}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>;
  if (ok) return <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success">{ok}</p>;
  return null;
}
