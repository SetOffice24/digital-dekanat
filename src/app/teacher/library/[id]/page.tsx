import { requireTeacher } from "@/server/auth";
import { LibraryDoc } from "@/components/knowledge/pages";

export const metadata = { title: "Материал библиотеки" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { user } = await requireTeacher();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <LibraryDoc user={user} base="/teacher/library" id={id} fresh={sp.new === "1"} />;
}
