import Link from "next/link";
import { requireTeacher } from "@/server/auth";
import { listApprovals } from "@/server/services/requests";
import { ApprovalList } from "@/components/services/approval-list";
import { toApprovalItems } from "@/components/services/approval-items";
import { PageHeader, SectionTitle } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Согласования" };

/** Перезачёты и другие заявки, которые согласует преподаватель дисциплины. Решение — здесь, без бумажных листов. */
export default async function TeacherApprovals() {
  const { user, teacher } = await requireTeacher();
  const a = { kind: "teacher" as const, teacherId: teacher.id, userId: user.id };
  const [pending, decided] = await Promise.all([listApprovals(a), listApprovals(a, "decided")]);
  return (
    <>
      <Link href="/teacher" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Сегодня
      </Link>
      <PageHeader title="Согласования" subtitle="Перезачёт дисциплины решает преподаватель: проверьте, где и с какой оценкой студент уже сдавал курс" />
      <ApprovalList items={toApprovalItems(pending)} empty="Нет заявок, ждущих вашего решения." />
      {decided.length > 0 && (
        <>
          <SectionTitle>Ваши решения</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {decided.map((d) => (
              <li key={d.id}>
                <span className={d.status === "APPROVED" ? "font-semibold text-success" : "font-semibold text-danger"}>{d.status === "APPROVED" ? "согласовано" : "отклонено"}</span> · №{d.request.number} {d.request.type.title} — {d.request.student.lastName} {d.request.student.firstName}{" "}
                <span className="text-muted">{d.decidedAt ? fmtDate(d.decidedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
