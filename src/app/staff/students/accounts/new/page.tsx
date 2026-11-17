import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups } from "@/server/repos/staff";
import { PageHeader } from "@/components/ui";
import { NewStudentForm } from "./form";

export const metadata = { title: "Добавить студента" };

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { staff } = await requireStaff();
  const groups = await listGroups(staff);
  const sp = await searchParams;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/staff/students/accounts" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Аккаунты
      </Link>
      <PageHeader title="Добавить студента" subtitle="Логин и временный пароль появятся после сохранения — их нужно передать студенту" />
      <NewStudentForm groups={groups.map((g) => ({ id: g.id, name: g.name, course: g.course }))} defaultGroup={groups.some((g) => g.id === sp.group) ? sp.group : undefined} />
    </div>
  );
}
