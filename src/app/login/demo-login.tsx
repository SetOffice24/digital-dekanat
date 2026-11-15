"use client";
import { useFormStatus } from "react-dom";
import { BookOpenCheck, Building2, GraduationCap, LoaderCircle, UserRound } from "lucide-react";
import { demoLoginAction } from "./actions";

// Демо-доступ для жюри: один клик — и вы внутри нужной роли. Все аккаунты вымышленные.
const ROLES = [
  { login: "anna.lesnova", role: "Студентка", who: "Анна · отличница", icon: GraduationCap, tone: "bg-[#e8f0ff] text-[#3456b8]" },
  { login: "petr.ozerov", role: "Студент", who: "Пётр · есть долг", icon: UserRound, tone: "bg-[#fff3d6] text-[#94650b]" },
  { login: "dekanat", role: "Деканат", who: "Заявки студентов", icon: Building2, tone: "bg-[#e3f6ec] text-[#1f7a4c]" },
  { login: "teacher", role: "Преподаватель", who: "Журнал и оценки", icon: BookOpenCheck, tone: "bg-[#efe9ff] text-[#5b45b0]" },
] as const;

function RoleButton({ r }: { r: (typeof ROLES)[number] }) {
  const { pending } = useFormStatus();
  const Icon = r.icon;
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl bg-[#f5f5f6] px-3 text-left transition hover:bg-[#ececef] active:scale-[0.99] disabled:opacity-60"
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${r.tone}`}>
        {pending ? <LoaderCircle size={18} className="animate-spin" /> : <Icon size={18} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-tight text-[#26262b]">{r.role}</span>
        <span className="block truncate text-[12px] text-[#6b7180]">{r.who}</span>
      </span>
    </button>
  );
}

export function DemoLogin() {
  return (
    <div className="rounded-[32px] bg-white/95 p-5 shadow-[0_20px_60px_-20px_rgba(60,70,110,0.35)] backdrop-blur sm:p-6">
      <p className="text-[15px] font-semibold text-[#26262b]">Демо-доступ</p>
      <p className="mt-0.5 text-[13px] text-[#6b7180]">Войдите в одну из ролей без пароля — данные вымышленные.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {ROLES.map((r) => (
          <form key={r.login} action={demoLoginAction}>
            <input type="hidden" name="login" value={r.login} />
            <RoleButton r={r} />
          </form>
        ))}
      </div>
    </div>
  );
}
