import { redirect } from "next/navigation";

/** Раздел «Ещё» объединён с профилем — оставляем старый адрес рабочим. */
export default function MorePage() {
  redirect("/profile");
}
