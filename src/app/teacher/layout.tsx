import { requireTeacher } from "@/server/auth";
import { TeacherShell } from "@/components/teacher/shell";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { teacher } = await requireTeacher();
  return (
    <TeacherShell name={teacher.fullName} department={teacher.department}>
      {children}
    </TeacherShell>
  );
}
