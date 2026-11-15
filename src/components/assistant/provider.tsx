"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantPanel } from "./assistant-panel";
import { Mascot } from "./mascot";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useAssistant = () => useContext(Ctx);

/** Помощник как выездная панель поверх любого раздела (на телефоне — на весь экран). */
export function AssistantProvider({ firstName, children }: { firstName: string; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const path = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}

      {/* Плавающая кнопка на десктопе (на телефоне — иконка в шапке) */}
      {!isOpen && path !== "/assistant" && (
        <button onClick={open} className="fixed bottom-6 right-6 z-30 hidden items-center gap-2.5 rounded-full bg-surface py-2 pl-2 pr-4 font-semibold shadow-[0_12px_32px_-12px_rgba(20,24,40,0.35)] ring-1 ring-border transition hover:-translate-y-0.5 lg:flex" aria-label="Открыть помощника">
          <Mascot size={36} />
          Спросить Уни
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="ИИ-помощник деканата">
          <button className="animate-fade-in absolute inset-0 bg-[#1b1d26]/40 backdrop-blur-[2px]" onClick={close} aria-label="Закрыть помощника" tabIndex={-1} />
          <div className={cn("animate-slide-in absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-surface shadow-2xl", "md:inset-y-3 md:right-3 md:w-[min(1180px,calc(100vw-1.5rem))] md:rounded-[28px] lg:w-[min(1180px,calc(100vw-300px))]")}>
            <AssistantPanel firstName={firstName} onClose={close} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Кнопка/ссылка, открывающая панель помощника. */
export function OpenAssistant({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open } = useAssistant();
  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  );
}
