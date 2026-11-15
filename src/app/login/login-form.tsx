"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

// Экран входа всегда светлый (как в образце): цвета заданы явно, без тем.
const field = "w-full min-h-[56px] rounded-2xl bg-[#f5f5f6] px-4 text-[15px] text-[#26262b] outline-none transition placeholder:text-[#9a9ca5] focus:bg-white focus:ring-2 focus:ring-[#4b6bd6]/35 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-[#c43d2b]/40";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="login" className="mb-1.5 block text-[13px] font-medium text-[#3a3a40]">
          Логин
        </label>
        <input id="login" name="login" autoComplete="username" autoCapitalize="none" defaultValue={state.login} placeholder="например, anna.lesnova" required aria-invalid={!!state.error} className={field} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[#3a3a40]">
          Пароль
        </label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required aria-invalid={!!state.error} className={`${field} pr-14`} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#6b7180] hover:bg-black/5" aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
            {show ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="rounded-2xl bg-[#fdebe8] px-4 py-2.5 text-sm font-medium text-[#c43d2b]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="mt-1 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#2f2f33] font-display text-[15px] font-medium tracking-wide text-white transition hover:bg-[#1f1f22] active:scale-[0.99] disabled:opacity-60">
        {pending && <LoaderCircle size={18} className="animate-spin" />}
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
