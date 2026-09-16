import { cn } from "@/lib/utils";

/**
 * The Finly mark.
 *
 * An F built from four pills: a tall stem, two arms of decreasing length, and
 * a dot where a third arm would be — the dot of the "i", borrowed. The five
 * brand colours appear here together and nowhere else at once.
 *
 * The gradient carries a fixed id. Several marks on one page therefore declare
 * the same one, which browsers resolve to the first — harmless, since every
 * declaration is identical, and it keeps the component usable from a server
 * component, where `useId` is not available.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="finly-stem" x1="4" y1="4" x2="10.5" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-blue)" />
          <stop offset="1" stopColor="var(--brand-violet)" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="6.5" height="24" rx="3.25" fill="url(#finly-stem)" />
      <rect x="12.75" y="4" width="15.25" height="6.5" rx="3.25" fill="var(--brand-coral)" />
      <rect x="12.75" y="12.75" width="10.5" height="6.5" rx="3.25" fill="var(--brand-amber)" />
      <rect x="12.75" y="21.5" width="6.5" height="6.5" rx="3.25" fill="var(--brand-mint)" />
    </svg>
  );
}

/** The mark and the word, as they appear in the header of every screen. */
export function Logo({ className, withText = true, size = 28 }: { className?: string; withText?: boolean; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <LogoMark size={size} />
      {withText ? <span className="text-[19px] tracking-[-0.03em]">Finly</span> : null}
    </span>
  );
}
