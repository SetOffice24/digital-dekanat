import { requireStaff } from "@/server/auth";
import { LibraryIndex } from "@/components/knowledge/pages";

export const metadata = { title: "Библиотека" };

export default async function Page() {
  const { user } = await requireStaff();
  return <LibraryIndex user={user} base="/staff/library" />;
}
