import { CheckCircle2, XCircle, SearchX } from "lucide-react";
import { prisma } from "@/server/db";
import { Logo } from "@/components/logo";
import { university } from "@/config/university";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Проверка справки" };
export const dynamic = "force-dynamic";

const isExpired = (d: Date) => d.getTime() < Date.now();

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cert = /^[A-Za-z0-9]{6,32}$/.test(code)
    ? await prisma.certificate.findUnique({
        where: { verifyCode: code.toUpperCase() },
        include: { request: { select: { number: true, type: { select: { title: true } }, student: { select: { lastName: true, firstName: true, middleName: true, group: { select: { name: true } } } } } } },
      })
    : null;
  const expired = cert ? isExpired(cert.validUntil) : false;
  const state = !cert ? "missing" : cert.revoked ? "revoked" : expired ? "expired" : "valid";
  const s = cert?.request.student;

  const view = {
    valid: { Icon: CheckCircle2, cls: "bg-success-soft text-success", title: "Справка действительна" },
    revoked: { Icon: XCircle, cls: "bg-danger-soft text-danger", title: "Справка отозвана" },
    expired: { Icon: XCircle, cls: "bg-warning-soft text-warning", title: "Срок действия справки истёк" },
    missing: { Icon: SearchX, cls: "bg-surface-2 text-muted", title: "Справка не найдена" },
  }[state];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Logo size={34} />
        <div className="leading-tight">
          <div className="font-extrabold">{university.product}</div>
          <div className="text-xs text-muted">{university.fullName}</div>
        </div>
      </div>
      <div className={`flex items-center gap-3 rounded-2xl p-4 ${view.cls}`}>
        <view.Icon size={28} />
        <h1 className="text-lg font-extrabold">{view.title}</h1>
      </div>
      {cert && s ? (
        <dl className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface px-4 text-sm">
          {[
            ["Документ", `${cert.request.type.title} № ${cert.request.number}`],
            ["Студент", [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ")],
            ["Группа", s.group.name],
            ["Дата выдачи", fmtDate(cert.issuedAt)],
            ["Действительна до", fmtDate(cert.validUntil)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">Проверьте, что код введён верно или QR-код отсканирован целиком.</p>
      )}
      <p className="mt-auto pt-8 text-xs text-muted">{university.disclaimer}</p>
    </main>
  );
}
