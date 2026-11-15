import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <SearchX size={28} />
      </span>
      <h1 className="text-2xl font-extrabold">Страница не найдена</h1>
      <p className="mt-2 max-w-sm text-muted">Возможно, ссылка устарела или у вас нет к ней доступа.</p>
      <ButtonLink href="/" className="mt-6">На главную</ButtonLink>
    </main>
  );
}
