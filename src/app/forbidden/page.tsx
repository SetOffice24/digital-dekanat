import { ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "Нет доступа" };

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <ShieldX size={28} />
      </span>
      <h1 className="text-2xl font-extrabold">Нет доступа</h1>
      <p className="mt-2 max-w-sm text-muted">Этот раздел доступен только сотрудникам деканата.</p>
      <ButtonLink href="/" className="mt-6">На главную</ButtonLink>
    </main>
  );
}
