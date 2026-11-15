"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    listeners.forEach((l) => l());
  };
  return (
    <button onClick={toggle} className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2" role="switch" aria-checked={dark}>
      <span className="flex size-10 items-center justify-center rounded-full bg-p-yellow text-[#0e0e10]">{dark ? <Moon size={18} /> : <Sun size={18} />}</span>
      <span className="flex-1">
        <span className="block font-semibold">Тёмная тема</span>
        <span className="block text-xs text-muted">{dark ? "Включена" : "Выключена"}</span>
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${dark ? "bg-ink" : "bg-border"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${dark ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
