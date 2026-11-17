import { requireTeacher } from "@/server/auth";
import { viewerOf } from "@/server/repos/messages";
import { NewMessage } from "@/components/messages/views";

export const metadata = { title: "Новое сообщение" };

export default async function Page({ searchParams }: { searchParams: Promise<{ to?: string; ctx?: string; id?: string }> }) {
  const { user } = await requireTeacher();
  const sp = await searchParams;
  return <NewMessage v={viewerOf(user)} base="/teacher/messages" to={sp.to} ctxType={sp.ctx} ctxId={sp.id} />;
}
