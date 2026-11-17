import QRCode from "qrcode";
import { UserRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { university } from "@/config/university";
import { idValidUntil } from "@/server/photos";
import { fmtDate } from "@/lib/utils";

type Card = {
  lastName: string;
  firstName: string;
  middleName: string | null;
  recordBookNo: string;
  course: number;
  idCode: string | null;
  faculty: { name: string };
  group: { name: string };
};

/**
 * Электронный студенческий билет: фото (принятое деканатом), ФИО, факультет, группа, номер, срок, QR.
 * QR ведёт на публичную страницу проверки «обучается» — без фото и номера зачётки.
 */
export async function StudentIdCard({ card, photoId }: { card: Card; photoId: string | null }) {
  const url = card.idCode ? `${process.env.APP_URL ?? ""}/verify/student/${card.idCode}` : null;
  const qr = url ? await QRCode.toDataURL(url, { margin: 1, width: 180, errorCorrectionLevel: "M" }) : null;
  return (
    <section aria-label="Электронный студенческий билет" className="overflow-hidden rounded-[28px] bg-p-lilac text-fg">
      <div className="flex items-center gap-2 px-5 pt-4">
        <Logo size={26} />
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] font-bold">Студенческий билет</div>
          <div className="truncate text-[11px] opacity-70">{university.fullName}</div>
        </div>
      </div>
      <div className="flex gap-4 p-5">
        <div className="w-[96px] shrink-0">
          {photoId ? (
            // eslint-disable-next-line @next/next/no-img-element -- защищённый маршрут с проверкой сессии
            <img src={`/api/photos/${photoId}`} alt="Фото студента" width={96} height={128} className="aspect-[3/4] w-full rounded-xl object-cover" />
          ) : (
            <div className="flex aspect-[3/4] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-fg/25 text-center text-[11px] leading-tight opacity-70">
              <UserRound size={28} className="mb-1" />
              нет фото
            </div>
          )}
        </div>
        <dl className="min-w-0 flex-1 space-y-1.5 text-[13px]">
          <div>
            <dt className="sr-only">ФИО</dt>
            <dd className="font-head text-[17px] font-semibold leading-tight">
              {card.lastName}
              <br />
              {card.firstName} {card.middleName}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] opacity-60">Факультет</dt>
            <dd className="font-medium leading-tight">{card.faculty.name}</dd>
          </div>
          <div className="flex gap-4">
            <div>
              <dt className="text-[11px] opacity-60">Группа</dt>
              <dd className="font-medium">{card.group.name}</dd>
            </div>
            <div>
              <dt className="text-[11px] opacity-60">Курс</dt>
              <dd className="font-medium">{card.course}</dd>
            </div>
          </div>
        </dl>
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-fg/10 px-5 py-3">
        <div className="text-[12px] leading-snug">
          <div>
            <span className="opacity-60">№ </span>
            <b className="font-semibold tabular-nums">{card.recordBookNo}</b>
          </div>
          <div>
            <span className="opacity-60">Действителен до </span>
            <b className="font-semibold">{fmtDate(idValidUntil())}</b>
          </div>
          <div className="mt-1 text-[11px] opacity-60">QR — проверка, что вы обучаетесь</div>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL
          <img src={qr} alt="QR-код для проверки студенческого" width={76} height={76} className="size-[76px] shrink-0 rounded-lg bg-white p-1" />
        )}
      </div>
    </section>
  );
}
