import { requireStaff } from "@/server/auth";
import { viewerOf } from "@/server/repos/messages";
import { MessagesScreen } from "@/components/messages/views";

export const metadata = { title: "Сообщения" };

export default async function Page({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { user } = await requireStaff();
  const sp = await searchParams;
  return <MessagesScreen v={viewerOf(user)} base="/staff/messages" filter={sp.f} q={sp.q} />;
}
