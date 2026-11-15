import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { requireTeacher } from "@/server/auth";
import { listClasses } from "@/server/repos/teacher";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { plural } from "@/lib/utils";

export const metadata = { title: "Мои группы" };

const tints = ["bg-p-sky", "bg-p-mint", "bg-p-lilac", "bg-p-yellow", "bg-p-peach"];

export default async function TeacherHome() {
  const { teacher } = await requireTeacher();
  const classes = await listClasses(teacher);
  return (
    <>
      <PageHeader title="Мои группы" subtitle="Выберите группу, чтобы открыть журнал и поставить оценку" />
      {classes.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="Пока нет групп" text="У вас нет назначенных занятий. Когда деканат добавит их в расписание, группы появятся здесь." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c, i) => (
            <Link key={c.groupId + c.courseId} href={`/teacher/${c.groupId}/${c.courseId}`} className="group block">
              <Card className={`flex h-full items-end justify-between gap-3 border-transparent transition group-hover:scale-[1.01] ${tints[i % tints.length]}`}>
                <div className="min-w-0">
                  <div className="font-head text-4xl font-semibold tracking-tight">{c.groupName}</div>
                  <div className="mt-1.5 text-[15px] font-medium">{c.courseName}</div>
                  <div className="mt-1 text-sm text-fg/70">
                    {c.studentCount} {plural(c.studentCount, "студент", "студента", "студентов")}
                  </div>
                </div>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-ink-fg" aria-hidden>
                  <ArrowRight size={20} />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
