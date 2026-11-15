import { redirect } from "next/navigation";

/** Список заявок объединён с «входящими» на /staff. */
export default function StaffRequests() {
  redirect("/staff");
}
