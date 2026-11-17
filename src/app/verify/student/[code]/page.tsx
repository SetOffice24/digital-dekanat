import { CheckCircle2, SearchX } from "lucide-react";
import { Logo } from "@/components/logo";
import { university } from "@/config/university";
import { verifyStudent } from "@/server/repos/photos";
import { idValidUntil } from "@/server/photos";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Проверка студенческого" };
export const dynamic = "force-dynamic";

/**
 * Публичная проверка электронного студенческого по QR (охрана, библиотека, музей со скидкой).
 * Показываем минимум: обучается или нет, фамилию с инициалами, факультет, группу. Без фото и номера зачётки.
 */
export default async function VerifyStudentPage({ params }: { params: Promise<{ code: string }> }) {
  const s = await verifyStudent((await params).code.toUpperCase());
  const initials = s ? `${s.lastName} ${s.firstName[0]}.${s.middleName ? ` ${s.middleName[0]}.` : ""}` : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Logo size={34} />
        <div className="leading-tight">
          <div className="font-extrabold">{university.product}</div>
          <div className="text-xs text-muted">{university.fullName}</div>
        </div>
      </div>
      <div className={`flex items-center gap-3 rounded-2xl p-4 ${s ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`}>
        {s ? <CheckCircle2 size={28} /> : <SearchX size={28} />}
        <h1 className="text-lg font-extrabold">{s ? "Студент обучается" : "Студенческий не найден"}</h1>
      </div>
      {s ? (
        <dl className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface px-4 text-sm">
          {[
            ["Студент", initials],
            ["Факультет", s.faculty.name],
            ["Группа, курс", `${s.group.name}, ${s.course} курс`],
            ["Билет действителен до", fmtDate(idValidUntil())],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">Проверьте, что QR-код отсканирован целиком. Если студент только что поступил, данные появятся после зачисления.</p>
      )}
      <p className="mt-4 text-xs text-muted">Сверьте фамилию с документом, который показывает студент.</p>
      <p className="mt-auto pt-8 text-xs text-muted">{university.disclaimer}</p>
    </main>
  );
}
