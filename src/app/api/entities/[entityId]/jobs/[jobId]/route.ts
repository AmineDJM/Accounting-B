import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { getJob } from "@/lib/dal/jobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ entityId: string; jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { entityId, jobId } = await params;
  try {
    await requireEntity(session.user.id, entityId);
  } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const job = await getJob(entityId, jobId);
  if (!job) return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
  return NextResponse.json({ id: job.id, kind: job.kind, status: job.status, progress: job.progress, message: job.message, log: job.log, result: job.result, startedAt: job.startedAt, finishedAt: job.finishedAt });
}
