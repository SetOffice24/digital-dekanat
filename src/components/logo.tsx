import { cn } from "@/lib/utils";

/**
 * Логотип «Универа» — собственная разработка.
 * Идея: в слове УНИВЕР буква «Е» собрана из трёх горизонтальных плашек —
 * стопка документов / строки расписания, то есть всё, ради чего студент открывает деканат.
 * Широкий геометрический шрифт Unbounded (OFL). Не копирует логотипы реальных вузов.
 */
export function Wordmark({ className, tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  return (
    <span
      className={cn("inline-flex select-none items-center font-display font-semibold uppercase leading-none tracking-[0.02em]", tone === "white" ? "text-white" : "text-ink", className)}
      aria-label="Универ"
      role="img"
    >
      <span aria-hidden>УНИВ</span>
      <span aria-hidden className="mx-[0.06em] inline-flex h-[0.74em] w-[0.6em] flex-col justify-between">
        <span className="h-[0.16em] w-full rounded-[0.05em] bg-current" />
        <span className="h-[0.16em] w-[80%] rounded-[0.05em] bg-accent-peach" />
        <span className="h-[0.16em] w-full rounded-[0.05em] bg-current" />
      </span>
      <span aria-hidden>Р</span>
    </span>
  );
}

/** Значок (для иконки приложения и узких мест): те же три плашки в скруглённом квадрате. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="10" fill="var(--ink)" />
      <rect x="9" y="9" width="14" height="3.2" rx="1" fill="var(--ink-fg)" />
      <rect x="9" y="14.4" width="11" height="3.2" rx="1" fill="#f4b393" />
      <rect x="9" y="19.8" width="14" height="3.2" rx="1" fill="var(--ink-fg)" />
    </svg>
  );
}
