import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobs, type JobKind } from "@/lib/db/schema";

export type Job = typeof jobs.$inferSelect;

/**
 * Lightweight in-process job runner. The web service on Render is a long-lived
 * Node process, so a background promise survives the HTTP response; progress is
 * persisted in the `jobs` table and polled by the UI.
 * (On serverless platforms, swap `spawn` for a queue such as Inngest/Trigger.dev.)
 */
const running = new Set<string>();

export async function createJob(entityId: string, kind: JobKind, userId: string | null, accountId?: string | null, message?: string): Promise<Job> {
  const db = await getDb();
  const [job] = await db.insert(jobs).values({ entityId, accountId: accountId ?? null, kind, createdBy: userId, message: message ?? null }).returning();
  return job;
}

export async function getJob(entityId: string, jobId: string): Promise<Job | null> {
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.entityId, entityId))).limit(1);
  return job ?? null;
}

export async function listJobs(entityId: string, limit = 10): Promise<Job[]> {
  const db = await getDb();
  return db.select().from(jobs).where(eq(jobs.entityId, entityId)).orderBy(desc(jobs.createdAt)).limit(limit);
}

export async function activeJob(entityId: string, kind?: JobKind): Promise<Job | null> {
  const db = await getDb();
  const rows = await db.select().from(jobs).where(and(eq(jobs.entityId, entityId), eq(jobs.status, "RUNNING"))).orderBy(desc(jobs.createdAt)).limit(5);
  return rows.find((j) => !kind || j.kind === kind) ?? null;
}

export interface JobContext {
  progress(percent: number, message?: string): Promise<void>;
  log(message: string, level?: "info" | "warn" | "error"): Promise<void>;
}

export function spawn(job: Job, fn: (ctx: JobContext) => Promise<Record<string, unknown> | void>): void {
  if (running.has(job.id)) return;
  running.add(job.id);
  const run = async () => {
    const db = await getDb();
    const logs: { at: string; level: string; message: string }[] = [];
    const ctx: JobContext = {
      async progress(percent, message) {
        await db.update(jobs).set({ progress: Math.max(0, Math.min(100, Math.round(percent))), ...(message ? { message } : {}) }).where(eq(jobs.id, job.id));
      },
      async log(message, level = "info") {
        logs.push({ at: new Date().toISOString(), level, message });
        await db.update(jobs).set({ log: logs.slice(-200) }).where(eq(jobs.id, job.id));
      },
    };
    await db.update(jobs).set({ status: "RUNNING", startedAt: new Date(), progress: 0 }).where(eq(jobs.id, job.id));
    try {
      const result = await fn(ctx);
      await db.update(jobs).set({ status: "DONE", progress: 100, finishedAt: new Date(), result: (result as Record<string, unknown>) ?? null, log: logs.slice(-200) }).where(eq(jobs.id, job.id));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logs.push({ at: new Date().toISOString(), level: "error", message });
      await db.update(jobs).set({ status: "FAILED", finishedAt: new Date(), message, log: logs.slice(-200) }).where(eq(jobs.id, job.id));
    } finally {
      running.delete(job.id);
    }
  };
  void run();
}

/** Marks jobs left RUNNING by a previous process (restart) as failed. */
export async function recoverStaleJobs(): Promise<void> {
  const db = await getDb();
  await db.update(jobs).set({ status: "FAILED", message: "Interrompu par un redémarrage du serveur", finishedAt: new Date() }).where(eq(jobs.status, "RUNNING"));
}
