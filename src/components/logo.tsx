import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
        <rect x="1" y="1" width="26" height="26" rx="7" className="fill-primary" />
        <path d="M8 9.5h8.5a3 3 0 0 1 0 6H8" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8 15.5h9.5a3 3 0 0 1 0 6H8" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
        <path d="M11 6.5v16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {withText ? <span className="text-[17px]">Chainbook</span> : null}
    </span>
  );
}
