"use client";
import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

/** Логин и временный пароль — показываются один раз. Сотрудник передаёт их студенту лично. */
export function CredentialsCard({ login, password }: { login: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Логин: ${login}\nВременный пароль: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <div className="rounded-2xl bg-p-yellow p-4 text-[#0e0e10]">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={16} /> Передайте студенту лично
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
        <dt className="opacity-70">Логин</dt>
        <dd className="break-all font-mono font-semibold">{login}</dd>
        <dt className="opacity-70">Пароль</dt>
        <dd className="font-mono font-semibold tracking-wide">{password}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#0e0e10] px-3 text-sm font-semibold text-white">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Скопировано" : "Скопировать"}
        </button>
        <span className="text-xs opacity-75">Пароль временный: при входе студент задаст свой. Повторно его не увидеть — при потере выдайте новый.</span>
      </div>
    </div>
  );
}
