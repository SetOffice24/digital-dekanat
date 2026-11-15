import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/* ---------- Card ---------- */
export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-[28px] border border-border/70 bg-surface p-5", className)} {...p} />;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 mt-9 flex items-center justify-between gap-2 first:mt-0", className)}>
      <h2 className="font-head text-lg font-semibold tracking-tight sm:text-xl">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-3 gap-y-4">
      <div className="min-w-0">
        <h1 className="font-head text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2.5 text-[15px] text-muted sm:text-lg">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "primary";
const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  primary: "bg-primary-soft text-primary",
};
export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", toneCls[tone], className)}>{children}</span>;
}

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const btnBase = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const btnVar: Record<Variant, string> = {
  primary: "bg-ink text-ink-fg hover:opacity-90",
  secondary: "border border-ink/90 bg-transparent text-fg hover:bg-ink hover:text-ink-fg",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};
export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(btnBase, btnVar[variant], className)} {...p} />;
}
export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(btnBase, btnVar[variant], className)} {...p} />;
}

/* ---------- Form ---------- */
export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-fg/80", className)} {...p} />;
}
const fieldCls = "w-full rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-[var(--ring)] aria-[invalid=true]:border-danger/50";
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(fieldCls, "min-h-13", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldCls, "min-h-24", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(fieldCls, "min-h-13 appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7180' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p} />;
}

/* ---------- Empty / Error ---------- */
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[28px] border border-dashed border-border bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

export function Progress({ value, tone = "primary" }: { value: number; tone?: "primary" | "warning" | "danger" | "success" }) {
  const c = { primary: "bg-primary", warning: "bg-warning", danger: "bg-danger", success: "bg-success" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
