"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobPanel, useJob } from "@/components/app/job-progress";
import { refreshAllAction } from "@/app/app/actions";

/**
 * The one button.
 *
 * It starts the whole chain and then follows the single job it creates, so the
 * person sees one progress bar rather than being told to visit three screens in
 * the right order.
 */
export function RefreshAll({ entityId, size = "sm", label = "Tout mettre à jour" }: { entityId: string; size?: "sm" | "md" | "lg"; label?: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const job = useJob(entityId, jobId, (j) => {
    if (j.status === "DONE") {
      const r = (j.result ?? {}) as { inserted?: number; entries?: number; warnings?: string[] };
      toast.success(`À jour : ${r.inserted ?? 0} nouvelle(s) opération(s)${r.entries ? `, ${r.entries} écritures` : ""}.`);
      if (r.warnings?.length) toast.warning(r.warnings[0]);
    } else {
      toast.error(j.message ?? "La mise à jour a échoué.");
    }
    setJobId(null);
  });

  return (
    <>
      <Button
        size={size}
        loading={pending || Boolean(job && job.status === "RUNNING")}
        onClick={() =>
          start(async () => {
            const r = await refreshAllAction(entityId);
            if (r.ok) setJobId(r.id);
            else toast.error(r.error);
          })
        }
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> {label}
      </Button>
      {/* Anchored to the corner rather than to the button: the chain runs for a
          while, and a panel inside a page header would squeeze the layout on
          every screen that carries the button. */}
      {job ? (
        <div className="fixed bottom-4 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius)] bg-surface shadow-[var(--shadow-lg)]">
          <JobPanel job={job} title="Mise à jour complète" />
        </div>
      ) : null}
    </>
  );
}
