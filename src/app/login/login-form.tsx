"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="login">Логин</Label>
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" defaultValue={state.login} placeholder="например, anna.lesnova" required aria-invalid={!!state.error} />
      </div>
      <div>
        <Label htmlFor="password">Пароль</Label>
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="pr-12" aria-invalid={!!state.error} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <LoaderCircle size={18} className="animate-spin" />}
        {pending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
