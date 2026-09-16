import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "positive" | "negative"; title?: string; children?: React.ReactNode; className?: string }) {
  const icons = { info: Info, warning: AlertTriangle, positive: CheckCircle2, negative: XCircle } as const;
  const Icon = icons[tone];
  const tones = { info: "bg-info-soft text-info", warning: "bg-warning-soft text-warning", positive: "bg-positive-soft text-positive", negative: "bg-negative-soft text-negative" } as const;
  return (
    <div className={cn("flex gap-3 rounded-lg p-3.5 text-sm", tones[tone], className)} role={tone === "negative" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-fg">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn("text-fg-muted", title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon: Icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "positive" | "negative" | "neutral"; icon?: LucideIcon }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-fg-subtle" aria-hidden /> : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular", tone === "positive" && "text-positive", tone === "negative" && "text-negative")}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-fg-muted">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      {Icon ? <div className="mb-4 rounded-full bg-primary-soft p-3 text-primary"><Icon className="h-6 w-6" aria-hidden /></div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto rounded-[var(--radius)] border border-border bg-surface">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-border bg-surface-2 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-subtle first:pl-4 last:pr-4", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-3 py-2.5 align-middle first:pl-4 last:pr-4", className)} {...props} />;
}
export function Money({ value, className, signed }: { value: number | string; className?: string; signed?: boolean }) {
  const n = Number(value);
  const s = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
  return <span className={cn("num", signed && n > 0 && "text-positive", signed && n < 0 && "text-negative", className)}>{signed && n > 0 ? `+${s}` : s}</span>;
}
