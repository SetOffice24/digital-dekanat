import { getCurrentUser } from "@/server/auth";
import { getCertificatePreview } from "@/server/repos/staff";
import { renderCertificatePdf } from "@/server/certificates";

export const runtime = "nodejs";

/** Черновик справки для деканата: посмотреть текст до выдачи. Студентам и чужим — 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await ctx.params;
  const user = await getCurrentUser();
  const notFound = () => new Response("Not found", { status: 404 });
  if (!user || user.role !== "STAFF" || !user.staff) return notFound();
  const data = await getCertificatePreview(user.staff, requestId);
  if (!data) return notFound();
  const pdf = await renderCertificatePdf(data, { preview: true });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="obrazec-${data.request.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
