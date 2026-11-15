import { requireStaff } from "@/server/auth";
import { StaffShell } from "@/components/staff/shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  return (
    <StaffShell name={staff.fullName} position={staff.position}>
      {children}
    </StaffShell>
  );
}
