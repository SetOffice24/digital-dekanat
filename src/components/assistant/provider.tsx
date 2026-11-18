"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AssistantPanel, type AssistantRole } from "./assistant-panel";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useAssistant = () => useContext(Ctx);

/** Помощник как выездная панель поверх любого раздела (на телефоне — на весь экран). */
export function AssistantProvider({ firstName, role = "STUDENT", children }: { firstName: string; role?: AssistantRole; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

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

      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Помощник">
          <button className="animate-fade-in absolute inset-0 bg-[#1b1d26]/40 backdrop-blur-[2px]" onClick={close} aria-label="Закрыть помощника" tabIndex={-1} />
          <div className={cn("animate-slide-in absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-surface shadow-2xl", "md:inset-y-3 md:right-3 md:w-[min(1180px,calc(100vw-1.5rem))] md:rounded-[28px] lg:w-[min(1180px,calc(100vw-300px))]")}>
            <AssistantPanel firstName={firstName} role={role} onClose={close} />
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
