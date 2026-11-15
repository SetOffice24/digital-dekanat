import { cn } from "@/lib/utils";

/**
 * Маскот помощника «Уни» — собственный персонаж: тёмный кубик с антенной,
 * глазами и персиковой «улыбкой-плашкой» из логотипа Универа. Глаза мягко моргают.
 */
export function Mascot({ size = 40, className, thinking }: { size?: number; className?: string; thinking?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={cn("shrink-0", className)} aria-hidden>
      <line x1="24" y1="10" x2="24" y2="5" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="4.5" r="3.2" fill="var(--peach)" className={thinking ? "animate-pulse" : undefined} />
      <rect x="6" y="10" width="36" height="31" rx="12" fill="var(--ink)" />
      <rect x="3" y="20" width="4" height="10" rx="2" fill="var(--ink)" />
      <rect x="41" y="20" width="4" height="10" rx="2" fill="var(--ink)" />
      <g className="mascot-eyes" fill="var(--ink-fg)">
        <rect x="15" y="19" width="5.5" height="9" rx="2.75" />
        <rect x="27.5" y="19" width="5.5" height="9" rx="2.75" />
      </g>
      <rect x="19" y="32" width="10" height="3.2" rx="1.6" fill="var(--peach)" />
    </svg>
  );
}
