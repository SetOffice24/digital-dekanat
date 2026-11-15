import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { university } from "@/config/university";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "STAFF" ? "/staff" : "/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{university.product}</h1>
          <p className="text-sm text-muted">{university.fullName}</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <LoginForm />
        </div>
        <div className="mt-6 flex gap-2 rounded-2xl bg-warning-soft p-3 text-[13px] leading-snug text-warning">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            <b>Концепт для конкурса</b> — не официальный сервис вуза. Все данные вымышленные. Тестовые аккаунты указаны в описании работы.
          </p>
        </div>
      </div>
    </main>
  );
}
