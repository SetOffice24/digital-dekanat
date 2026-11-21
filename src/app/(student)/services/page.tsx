import { redirect } from "next/navigation";

/** Единое окно живёт на /requests (старые ссылки работают); /services — вложенные разделы. */
export default function ServicesIndex() {
  redirect("/requests");
}
