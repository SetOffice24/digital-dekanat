"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

/** Системные оповещения браузера: показываются, когда вкладка с кабинетом открыта, но свёрнута. */
export function BrowserAlerts() {
  const [state, setState] = useState<NotificationPermission | "unsupported" | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setState(typeof Notification === "undefined" ? "unsupported" : Notification.permission), 0);
    return () => clearTimeout(t);
  }, []);
  if (state === null || state === "unsupported") return null;
  const on = state === "granted";
  const hint = on ? "Включены — придут, даже если вкладка свёрнута" : state === "denied" ? "Запрещены в настройках браузера" : "Переносы пар и ответы деканата — сразу";
  return (
    <button
      type="button"
      disabled={state === "denied" || on}
      onClick={async () => setState(await Notification.requestPermission())}
      className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
      role="switch"
      aria-checked={on}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">
        <BellRing size={18} />
      </span>
      <span className="flex-1">
        <span className="block font-semibold">Оповещения в браузере</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-ink" : "bg-border"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
