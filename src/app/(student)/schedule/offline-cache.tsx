"use client";
import { useEffect } from "react";

/** Сохраняет последнюю открытую неделю расписания — её показывает офлайн-страница. */
export function OfflineCache({ data }: { data: unknown }) {
  useEffect(() => {
    try {
      localStorage.setItem("univer:schedule", JSON.stringify(data));
    } catch {
      /* хранилище недоступно — не критично */
    }
  }, [data]);
  return null;
}
