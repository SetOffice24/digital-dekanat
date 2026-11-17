import { requireStudent } from "@/server/auth";
import { viewerOf } from "@/server/repos/messages";
import { MessagesScreen, Thread } from "@/components/messages/views";

export const metadata = { title: "Сообщения" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; q?: string }> }) {
  const { user } = await requireStudent();
  const { id } = await params;
  const sp = await searchParams;
  const v = viewerOf(user);
  return (
    <MessagesScreen v={v} base="/messages" activeId={id} filter={sp.f} q={sp.q}>
      <Thread v={v} base="/messages" id={id} />
    </MessagesScreen>
  );
}
