import { redirect } from "next/navigation";
import { CircleHelp, Info } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { university } from "@/config/university";
import { Wordmark } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "STAFF" ? "/staff" : "/");
  return (
    <main className="relative flex min-h-dvh flex-col bg-[#c9d3e3] bg-[url(/bg/sky.svg)] bg-cover bg-center px-4">
      <header className="flex items-center justify-between py-6 sm:px-6">
        <Wordmark tone="white" className="text-[22px] drop-shadow-[0_1px_8px_rgba(60,70,110,0.25)] sm:text-[26px]" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center pb-10">
        <div className="w-full max-w-[460px]">
          <div className="rounded-[32px] bg-white/95 p-7 shadow-[0_20px_60px_-20px_rgba(60,70,110,0.35)] backdrop-blur sm:p-8">
            <h1 className="text-center font-display text-[26px] font-semibold tracking-tight text-[#26262b]">Цифровой деканат</h1>
            <p className="mt-5 text-[15px] leading-snug text-[#26262b]">
              Добро пожаловать в {university.name}!
              <br />
              Войдите, чтобы продолжить
            </p>
            <div className="mt-5">
              <LoginForm />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between px-1 text-[13px] font-semibold text-white drop-shadow-[0_1px_6px_rgba(60,70,110,0.35)]">
            <span className="inline-flex items-center gap-1.5">
              <Info size={15} /> Концепт для конкурса
            </span>
            <a href={`mailto:${university.deanOffice.email}`} className="inline-flex items-center gap-1.5 hover:underline">
              Поддержка <CircleHelp size={16} />
            </a>
          </div>
          <p className="mt-3 px-1 text-center text-xs text-white/90 drop-shadow-[0_1px_6px_rgba(60,70,110,0.35)]">{university.disclaimer}</p>
        </div>
      </div>
    </main>
  );
}
