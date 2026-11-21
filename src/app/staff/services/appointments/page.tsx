import { requireStaff } from "@/server/auth";
import { deskAppointments } from "@/server/services/appointments";
import { DeskList } from "@/components/services/desk";
import { toDeskItems } from "@/components/services/desk-items";
import { SectionTitle } from "@/components/ui";
import { addDays, moscowToday } from "@/lib/utils";
import { deanery } from "@/config/services";

export const metadata = { title: "Приём" };

/** Приём в деканате: сегодня и ближайшая неделя. Отметка «пришёл / не пришёл» — для статистики неявок. */
export default async function StaffDesk() {
  const { user, staff } = await requireStaff();
  const desk = { id: staff.id, userId: user.id, facultyId: staff.facultyId };
  const today = new Date(moscowToday().getTime() - 3 * 3600_000);
  const [todayRows, later] = await Promise.all([deskAppointments(desk, today, addDays(today, 1)), deskAppointments(desk, addDays(today, 1), addDays(today, 8))]);
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {deanery.room}, {deanery.hours}. Студенты записываются в разделе «Услуги» — придут без очереди.
      </p>
      <SectionTitle>Сегодня</SectionTitle>
      <DeskList items={toDeskItems(todayRows, "/staff/requests")} />
      <SectionTitle>Ближайшие дни</SectionTitle>
      <DeskList items={toDeskItems(later, "/staff/requests")} />
    </>
  );
}
