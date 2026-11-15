import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireStudent } from "@/server/auth";
import { getProfile } from "@/server/repos/student";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const { student } = await requireStudent();
  const p = await getProfile(student);
  const rows = [
    ["ФИО", [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ")],
    ["Факультет", p.faculty.name],
    ["Направление", `${p.program.code} ${p.program.name}`],
    ["Курс", `${p.course}`],
    ["Группа", `${p.group.name}, подгруппа ${p.subgroup}`],
    ["Форма обучения", "Очная, бюджет"],
    ["№ зачётной книжки", p.recordBookNo],
    ["Стипендия", p.scholarship ? "Академическая" : "Не назначена"],
    ["Почта", p.email ?? "—"],
    ["Логин", p.user.login],
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/more" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Назад
      </Link>
      <PageHeader title="Профиль" subtitle="Данные из учебного отдела. Если есть ошибка — напишите в деканат." />
      <Card className="divide-y divide-border p-0">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
            <span className="shrink-0 text-sm text-muted sm:w-48">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </Card>
      <SectionTitle>Безопасность</SectionTitle>
      <Card className="flex gap-3 text-sm">
        <ShieldCheck className="shrink-0 text-success" />
        <p>
          Пароль хранится только в виде криптографического хэша (argon2id). Вход защищён от подбора. Вы видите только свои данные — другие студенты их не видят.
        </p>
      </Card>
    </div>
  );
}
