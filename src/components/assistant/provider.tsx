"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AssistantPanel, type AssistantRole } from "./assistant-panel";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useAssistant = () => useContext(Ctx);

/** Помощник как выездная панель поверх любого раздела (на телефоне — на весь экран). */
export function AssistantProvider({ firstName, role = "STUDENT", children }: { firstName: string; role?: AssistantRole; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback(() => {
    // запоминаем, откуда открыли, — после закрытия фокус вернётся туда
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  /*
   * Модальное окно целиком: Escape закрывает; Tab/Shift+Tab ходят по кругу только внутри панели
   * (фон вдобавок недоступен через inert); после закрытия фокус — на кнопке, которая открыла помощника.
   */
  useEffect(() => {
    if (!isOpen) return;
    const focusables = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])') ?? [])].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && el.offsetParent !== null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return e.preventDefault();
      const first = items[0], last = items[items.length - 1];
      const inside = panel.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // если поле ввода не взяло фокус само — переводим его в панель
    const t = setTimeout(() => {
      if (!panel.current?.contains(document.activeElement)) focusables()[0]?.focus();
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      const back = opener.current;
      // кнопка могла исчезнуть (переход по ссылке из помощника) — тогда фокус на основное содержимое
      setTimeout(() => (back?.isConnected ? back : document.querySelector<HTMLElement>("main"))?.focus({ preventScroll: true }), 0);
    };
  }, [isOpen]);

  return (
    <Ctx.Provider value={{ open, close }}>
      {/* фон под открытым помощником недоступен для клавиатуры и чтения с экрана */}
      <div className="contents" inert={isOpen}>
        {children}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Помощник">
          <button className="animate-fade-in absolute inset-0 bg-[#1b1d26]/40 backdrop-blur-[2px]" onClick={close} aria-label="Закрыть помощника" tabIndex={-1} />
          <div ref={panel} className={cn("animate-slide-in absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-surface shadow-2xl", "md:inset-y-3 md:right-3 md:w-[min(1180px,calc(100vw-1.5rem))] md:rounded-[28px] lg:w-[min(1180px,calc(100vw-300px))]")}>
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
