"use client";

import * as React from "react";
import { ChevronRight, ExternalLink, Info, Scale, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LegalRef, TraceStep, TraceValue } from "@/lib/engine/trace";

/**
 * Explainability viewer.
 *
 * Every figure the app produces carries the steps that made it. The viewer
 * renders that tree so a reader can go from a total down to a single quantity
 * and the article it comes from, without leaving the page and without the app
 * having to recompute anything: the trace is data, stored with the result.
 *
 * Two choices matter for how it reads. Inputs are shown as a definition list
 * rather than a table, because a step usually has three or four of them and a
 * table would add borders around nothing. And the legal references sit at the
 * step they justify, not collected at the bottom, because the question a
 * reviewer asks is "why this number", never "what did you read in general".
 */
export function TraceView({ root, defaultOpen = 1, className }: { root: TraceStep; defaultOpen?: number; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius)] border border-border bg-surface", className)}>
      <StepNode step={root} depth={0} defaultOpen={defaultOpen} />
    </div>
  );
}

function StepNode({ step, depth, defaultOpen }: { step: TraceStep; depth: number; defaultOpen: number }) {
  const [open, setOpen] = React.useState(depth < defaultOpen);
  const hasChildren = step.steps.length > 0;
  const hasDetail = step.inputs.length > 0 || Boolean(step.formula) || Boolean(step.note) || step.refs.length > 0;
  const expandable = hasChildren || hasDetail;

  return (
    <div className={cn(depth > 0 && "border-t border-border")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        className={cn(
          "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors first:rounded-t-[var(--radius)]",
          expandable && "hover:bg-surface-2",
          !expandable && "cursor-default",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <ChevronRight
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-90", !expandable && "opacity-0")}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", depth === 0 ? "font-semibold" : "font-medium")}>{step.label}</span>
          {step.output ? (
            <span className="mt-0.5 block text-sm text-fg-muted">
              <ValueText value={step.output} strong />
            </span>
          ) : null}
        </span>
        {step.warning ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Hypothèse à vérifier" /> : null}
        {hasChildren ? <Badge tone="neutral" className="mt-0.5 shrink-0">{step.steps.length}</Badge> : null}
      </button>

      {open && hasDetail ? (
        <div className="space-y-3 px-3 pb-3 text-sm" style={{ paddingLeft: `${32 + depth * 16}px` }}>
          {step.formula ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg-muted">{step.formula}</p>
          ) : null}

          {step.inputs.length ? (
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {step.inputs.map((v, i) => (
                <div key={`${v.label}-${i}`} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border py-1">
                  <dt className="text-fg-muted">
                    {v.label}
                    {v.note ? <span className="ml-1 text-xs text-fg-subtle">({v.note})</span> : null}
                  </dt>
                  <dd className="shrink-0 text-right">
                    <ValueText value={v} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {step.note ? (
            <p className="flex gap-2 text-fg-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <span>{step.note}</span>
            </p>
          ) : null}

          {step.warning ? (
            <p className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-fg">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <span>{step.warning}</span>
            </p>
          ) : null}

          {step.refs.length ? <RefList refs={step.refs} /> : null}
        </div>
      ) : null}

      {open && hasChildren ? (
        <div>
          {step.steps.map((child) => (
            <StepNode key={child.key} step={child} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ValueText({ value, strong }: { value: TraceValue; strong?: boolean }) {
  const numeric = value.unit === "MONEY" || value.unit === "QTY" || value.unit === "RATE" || value.unit === "COUNT" || value.unit === "DAYS";
  return (
    <span className={cn(numeric && "num tabular", strong && "font-medium text-fg")} title={value.raw && value.raw !== value.value ? value.raw : undefined}>
      {value.value}
      {value.unit === "MONEY" && value.currency ? <span className="ml-1 text-fg-subtle">{value.currency}</span> : null}
    </span>
  );
}

/** The articles a step rests on, each one a link when the source is online. */
export function RefList({ refs, className }: { refs: LegalRef[]; className?: string }) {
  if (!refs.length) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {refs.map((r, i) => (
        <li key={`${r.code}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
          <Scale className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-fg-subtle" aria-hidden />
          <span className="font-medium">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">
                {r.code}
                <ExternalLink className="ml-0.5 inline h-3 w-3" aria-hidden />
              </a>
            ) : (
              r.code
            )}
          </span>
          {r.title ? <span className="text-fg-muted">{r.title}</span> : null}
          {r.asOf ? <span className="text-fg-subtle">au {formatIso(r.asOf)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function formatIso(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}
