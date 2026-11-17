import { requireTeacher } from "@/server/auth";
import { viewerOf } from "@/server/repos/messages";
import { MessagesScreen, Thread } from "@/components/messages/views";

export const metadata = { title: "Сообщения" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; q?: string }> }) {
  const { user } = await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;
  const v = viewerOf(user);
  return (
    <MessagesScreen v={v} base="/teacher/messages" activeId={id} filter={sp.f} q={sp.q}>
      <Thread v={v} base="/teacher/messages" id={id} />
    </MessagesScreen>
  );
}
