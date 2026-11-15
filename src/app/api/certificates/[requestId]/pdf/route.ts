import { getCurrentUser } from "@/server/auth";
import { getCertificateForStudent } from "@/server/repos/student";
import { getCertificateForStaff } from "@/server/repos/staff";
import { renderCertificatePdf } from "@/server/certificates";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await ctx.params;
  const user = await getCurrentUser();
  const notFound = () => new Response("Not found", { status: 404 });
  if (!user) return notFound();

  let cert = null;
  if (user.role === "STUDENT" && user.student) cert = await getCertificateForStudent(user.student, requestId);
  else if (user.role === "STAFF" && user.staff) cert = await getCertificateForStaff(user.staff, requestId);
  if (!cert) return notFound();

  const pdf = await renderCertificatePdf(cert);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="spravka-${cert.request.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
