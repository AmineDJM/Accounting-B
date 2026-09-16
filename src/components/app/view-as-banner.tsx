"use client";

import { useTransition } from "react";
import { Eye, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stopViewAsAction } from "@/app/admin/actions";

/**
 * The banner an administrator sees while looking at someone else's account.
 *
 * Deliberately impossible to miss and impossible to dismiss: the one failure
 * mode that matters here is forgetting whose screen you are on and reading a
 * client's figures as your own. It also states the two facts that bound the
 * session — read-only, and it expires.
 */
export function ViewAsBanner({
  target, admin, expiresLabel, reason,
}: {
  target: string; admin: string; expiresLabel: string; reason: string;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="sticky top-0 z-50 border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-fg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
        <Eye className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span>
          <strong className="font-semibold">Vous consultez le compte de {target}</strong> en lecture seule, en tant que {admin}.
        </span>
        <span className="text-fg-muted">Motif : {reason}</span>
        <span className="text-fg-subtle">Jusqu&apos;à {expiresLabel}</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          loading={pending}
          onClick={() => start(async () => { await stopViewAsAction(); })}
        >
          <LogOut className="h-4 w-4" /> Quitter
        </Button>
      </div>
    </div>
  );
}
