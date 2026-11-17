import { KeyRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { university } from "@/config/university";
import { userForPasswordChange, homeFor } from "@/server/auth";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Задайте свой пароль" };
export const dynamic = "force-dynamic";

/** После временного пароля от деканата: задать свой, иначе кабинет не откроется. */
export default async function ChangePasswordPage() {
  const user = await userForPasswordChange();
  if (!user.mustChangePassword) redirect(homeFor(user.role));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <div className="mb-8 flex items-center gap-2.5">
        <Logo size={34} />
        <div className="leading-tight">
          <div className="font-extrabold">{university.product}</div>
          <div className="text-xs text-muted">{university.fullName}</div>
        </div>
      </div>
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-p-yellow text-[#0e0e10]">
        <KeyRound size={22} />
      </span>
      <h1 className="font-head text-3xl font-semibold tracking-[-0.02em]">Задайте свой пароль</h1>
      <p className="mt-2 text-muted">
        Вы вошли по временному паролю из деканата. Придумайте свой — временный после этого перестанет работать. Логин: <b className="font-semibold text-fg">{user.login}</b>
      </p>
      <div className="mt-6">
        <ChangePasswordForm />
      </div>
      <form action={logoutAction} className="mt-4">
        <button className="text-sm font-medium text-muted underline underline-offset-2 hover:text-fg">Выйти</button>
      </form>
      <p className="mt-auto pt-8 text-xs text-muted">{university.disclaimer}</p>
    </main>
  );
}
