"use client";
import useSWR from "swr";
import { LiveNotice, type Latest } from "./live-notice";

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { count: 0, latest: null }));

/**
 * Живые события у преподавателя и деканата: новая сдача ДЗ, согласование, перенос пары, заявка по приёму.
 * Тот же опрос, что у студента (раз в 15 с и при возврате на вкладку): карточка поверх страницы и обновление экрана.
 */
export function RoleLiveNotice({ home }: { home: string }) {
  const { data } = useSWR<{ count: number; latest: Latest }>("/api/notifications/unread", fetcher, { refreshInterval: 15000, revalidateOnFocus: true });
  if (data === undefined) return null;
  return <LiveNotice latest={data.latest ?? null} count={data.count ?? 0} fallbackHref={home} />;
}
