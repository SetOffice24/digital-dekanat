"use client";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 30000);
  return () => clearInterval(t);
};
const snapshot = () => Math.floor(Date.now() / 30000) * 30000;

/** Обратный отсчёт до времени начала (ISO). Обновляется раз в 30 секунд. */
export function Countdown({ to, startedLabel = "уже началась" }: { to: string; startedLabel?: string }) {
  const now = useSyncExternalStore(subscribe, snapshot, () => null);
  if (now === null) return <span className="opacity-0">…</span>;
  const diff = Math.round((new Date(to).getTime() - now) / 60000);
  if (diff <= 0) return <>{startedLabel}</>;
  if (diff < 60) return <>через {diff} мин</>;
  const h = Math.floor(diff / 60), m = diff % 60;
  if (h < 24) return <>через {h} ч {m ? `${m} мин` : ""}</>;
  return <>через {Math.floor(h / 24)} дн</>;
}
