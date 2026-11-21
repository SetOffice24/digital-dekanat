import Link from "next/link";
import { requireStudent } from "@/server/auth";
import { availability, myAppointments } from "@/server/services/appointments";
import { PageHeader } from "@/components/ui";
import { deanery } from "@/config/services";
import { fmtDateTime } from "@/lib/utils";
import { BookingForm, CancelButton } from "./parts";

export const metadata = { title: "Запись на приём" };

const STATUS: Record<string, string> = { BOOKED: "записан", DONE: "приём состоялся", NO_SHOW: "не пришёл", CANCELLED: "отменено" };

/** Запись на приём в деканат без очереди: выбрать день и время. За час — напоминание. */
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ purpose?: string; request?: string }> }) {
  const { student } = await requireStudent();
  const sp = await searchParams;
  const [days, mine] = await Promise.all([availability(8), myAppointments(student.id)]);
  const now = new Date();
  const upcoming = mine.filter((a) => a.status === "BOOKED" && a.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = mine.filter((a) => !upcoming.includes(a)).slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/requests" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-fg">
        ← Услуги
      </Link>
      <PageHeader title="Запись в деканат" subtitle={`${deanery.room}, ${deanery.hours}. Выберите время — придёте без очереди, напомним за час.`} />

      {upcoming.length > 0 && (
        <section className="mb-6 space-y-2">
          <h2 className="text-[15px] font-bold">Мои записи</h2>
          {upcoming.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-[24px] bg-p-yellow/60 p-4">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{fmtDateTime(a.startsAt)}</span>
                <span className="block text-[13px]">
                  {a.purpose}
                  {a.request && (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/requests/${a.request.id}`} className="underline">
                        заявка №{a.request.number}
                      </Link>
                    </>
                  )}
                </span>
              </span>
              <CancelButton id={a.id} />
            </div>
          ))}
        </section>
      )}

      <BookingForm days={days.map((x) => ({ day: x.day.toISOString(), slots: x.slots.map((s) => ({ at: s.at.toISOString(), free: s.free })) }))} purpose={sp.purpose?.slice(0, 200) ?? ""} requestId={sp.request ?? ""} />

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[15px] font-bold">Прошлые записи</h2>
          <ul className="space-y-1.5 text-sm">
            {past.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2 text-muted">
                <span className="font-medium text-fg">{fmtDateTime(a.startsAt)}</span>
                <span>· {a.purpose}</span>
                <span>· {STATUS[a.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
