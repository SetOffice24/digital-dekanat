import { requireStudent } from "@/server/auth";
import { prisma } from "@/server/db";
import { StudentShell } from "@/components/shell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student } = await requireStudent();
  const group = await prisma.group.findUnique({ where: { id: student.groupId }, select: { name: true } });
  return (
    <StudentShell initials={`${student.firstName[0]}${student.lastName[0]}`} firstName={student.firstName} name={`${student.firstName} ${student.lastName}`} group={`${group?.name ?? ""} · ${student.course} курс`}>
      {children}
    </StudentShell>
  );
}
