"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { changePasswordAction, type LoginState } from "@/app/login/actions";

const field = "w-full min-h-12 rounded-2xl bg-surface-2 px-4 text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-ink/30";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Новый пароль
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={field} />
        <p className="mt-1 text-xs text-muted">Не короче 8 символов, буквы и хотя бы одна цифра.</p>
      </div>
      <div>
        <label htmlFor="repeat" className="mb-1.5 block text-sm font-medium">
          Повторите пароль
        </label>
        <input id="repeat" name="repeat" type="password" autoComplete="new-password" required className={field} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink font-semibold text-ink-fg disabled:opacity-60">
        {pending && <LoaderCircle size={18} className="animate-spin" />} Сохранить и войти
      </button>
    </form>
  );
}
