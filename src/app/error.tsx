"use client";
import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <TriangleAlert size={28} />
      </span>
      <h1 className="text-2xl font-extrabold">Что-то пошло не так</h1>
      <p className="mt-2 max-w-sm text-muted">Мы уже знаем об ошибке. Попробуйте обновить страницу.</p>
      <button onClick={reset} className="mt-6 min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-fg">
        Повторить
      </button>
    </main>
  );
}
