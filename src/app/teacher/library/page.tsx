import { requireTeacher } from "@/server/auth";
import { LibraryIndex } from "@/components/knowledge/pages";

export const metadata = { title: "Библиотека" };

export default async function Page() {
  const { user } = await requireTeacher();
  return <LibraryIndex user={user} base="/teacher/library" />;
}
