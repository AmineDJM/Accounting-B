"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface JobState { id: string; kind: string; status: "QUEUED" | "RUNNING" | "DONE" | "FAILED"; progress: number; message: string | null; log: { at: string; level: string; message: string }[]; result?: Record<string, unknown> | null }

export function useJob(entityId: string, jobId: string | null, onDone?: (job: JobState) => void) {
  const [job, setJob] = useState<JobState | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/entities/${entityId}/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as JobState;
        if (stop) return;
        setJob(j);
        if (j.status === "DONE" || j.status === "FAILED") { onDone?.(j); router.refresh(); return; }
      } catch { /* retry */ }
      timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, jobId]);
  return job;
}

export function JobPanel({ job, title }: { job: JobState | null; title?: string }) {
  if (!job) return null;
  const done = job.status === "DONE", failed = job.status === "FAILED";
  return (
    <div className={cn("rounded-lg border p-4", failed ? "border-negative/40 bg-negative-soft/40" : done ? "border-positive/40 bg-positive-soft/40" : "border-border bg-surface-2")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title ?? (job.kind === "API_SYNC" ? "Synchronisation" : job.kind === "JOURNAL" ? "Génération du journal" : "Traitement")}</p>
        {done ? <CheckCircle2 className="h-4 w-4 text-positive" /> : failed ? <XCircle className="h-4 w-4 text-negative" /> : <span className="text-xs text-fg-muted">{job.progress}%</span>}
      </div>
      {!done && !failed ? <Progress value={job.progress} className="mt-2" /> : null}
      <p className="mt-2 text-xs text-fg-muted">{job.message}</p>
      {job.log.length ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-fg-subtle">Journal ({job.log.length})</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto font-mono">
            {job.log.slice(-40).map((l, i) => <li key={i} className={cn(l.level === "warn" && "text-warning", l.level === "error" && "text-negative")}>{l.at.slice(11, 19)} {l.message}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
