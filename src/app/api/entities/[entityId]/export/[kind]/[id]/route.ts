import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { exportFec, loadEntries, trialBalance } from "@/lib/services/journal";
import { loadAllTransactions } from "@/lib/dal/transactions";
import { getJob } from "@/lib/dal/jobs";
import { chartFor } from "@/lib/services/journal";
import { listAccounts } from "@/lib/dal/accounts";
import { buildAuditFile } from "@/lib/services/auditfile";
import { eventsCsv } from "@/lib/services/countrytax";
import { D } from "@/lib/engine/money";
import type { TaxComputationResult, TaxableEvent } from "@/lib/engine/tax/types";
import type { AuditFileFormat } from "@/lib/exports";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csvFile = (name: string, rows: unknown[][]) =>
  new NextResponse("﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });

export async function GET(req: Request, { params }: { params: Promise<{ entityId: string; kind: string; id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { entityId, kind, id } = await params;
  let entity;
  try { entity = (await requireEntity(session.user.id, entityId)).entity; } catch { return NextResponse.json({ error: "Accès refusé" }, { status: 403 }); }

  try {
    switch (kind) {
      case "fec": {
        const fec = await exportFec(session.user.id, entityId, id);
        return new NextResponse(fec.content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${fec.fileName}"`, "X-FEC-Valid": String(fec.report.ok) } });
      }
      case "auditfile": {
        // The country's own file by default; ?format= overrides it, which is
        // what a practice needs when a file changes hands across a border.
        const asked = new URL(req.url).searchParams.get("format") as AuditFileFormat | null;
        const { output, bytes } = await buildAuditFile(session.user.id, entityId, id, asked ?? undefined);
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "Content-Type": `${output.mimeType}; charset=${output.encoding}`,
            "Content-Disposition": `attachment; filename="${output.fileName}"`,
            "X-Audit-Warnings": String(output.warnings.length),
            "X-Audit-Format": output.format,
          },
        });
      }
      case "entries": {
        const entries = await loadEntries(id);
        const rows: unknown[][] = [["Journal", "N°", "Date", "Pièce", "Compte", "Libellé compte", "Libellé", "Débit", "Crédit", "Quantité", "Actif", "Nature"]];
        for (const e of entries) for (const l of e.lines) rows.push([e.journalCode, e.num, e.date.toISOString().slice(0, 10), e.pieceRef, l.account, l.accountLabel, l.label, l.debit.toFixed(2).replace(".", ","), l.credit.toFixed(2).replace(".", ","), l.currencyAmount?.toString().replace(".", ",") ?? "", l.currency ?? "", e.kind]);
        return csvFile(`ecritures-${entity.name.replace(/\W+/g, "_")}.csv`, rows);
      }
      case "balance": {
        const entries = await loadEntries(id);
        const rows: unknown[][] = [["Compte", "Libellé", "Débit", "Crédit", "Solde"]];
        for (const b of trialBalance(entries)) rows.push([b.account, b.label, b.debit.toFixed(2).replace(".", ","), b.credit.toFixed(2).replace(".", ","), b.balance.toFixed(2).replace(".", ",")]);
        return csvFile(`balance-${entity.name.replace(/\W+/g, "_")}.csv`, rows);
      }
      case "transactions": {
        const txs = await loadAllTransactions(entityId);
        const accounts = await listAccounts(session.user.id, entityId);
        const labels = Object.fromEntries(accounts.map((a) => [a.id, a.label]));
        const rows: unknown[][] = [["Date (UTC)", "Compte", "Type", "Catégorie", "Sortie", "Actif sortie", "Entrée", "Actif entrée", "Frais", "Actif frais", "Adresse", "Hash", "Référence", "Note", "Source"]];
        for (const t of txs) {
          const o = t.legs.find((l) => l.role === "OUT"), i = t.legs.find((l) => l.role === "IN"), f = t.legs.find((l) => l.role === "FEE");
          rows.push([t.timestamp.toISOString().replace("T", " ").slice(0, 19), labels[t.accountId] ?? t.accountId, t.type, t.category, o?.amount.toString().replace(".", ",") ?? "", o?.asset ?? "", i?.amount.toString().replace(".", ",") ?? "", i?.asset ?? "", f?.amount.toString().replace(".", ",") ?? "", f?.asset ?? "", t.counterparty?.address ?? "", t.counterparty?.txHash ?? "", t.ref ?? "", t.note ?? "", t.source]);
        }
        return csvFile(`transactions-${entity.name.replace(/\W+/g, "_")}.csv`, rows);
      }
      case "chart": {
        const chart = chartFor(entity);
        const rows: unknown[][] = [["Compte", "Libellé"]];
        for (const [k, v] of Object.entries(chart)) if (typeof v === "object" && v && "number" in v) rows.push([(v as { number: string }).number, `${(v as { label: string }).label} (${k})`]);
        for (const [asset, num] of Object.entries(entity.assetAccountMap ?? {})) rows.push([num, asset.startsWith("FIAT:") ? `Devises sur plateforme – ${asset.slice(5)}` : `Jetons détenus – ${asset}`]);
        const accounts = await listAccounts(session.user.id, entityId);
        for (const a of accounts) rows.push([`${chart.exchangeFiatPrefix}${String(a.index).padStart(2, "0")}`, `Plateforme ${a.label} – solde EUR`]);
        rows.sort((a, b) => (a[0] === "Compte" ? -1 : String(a[0]).localeCompare(String(b[0]))));
        return csvFile(`plan-de-comptes-${entity.name.replace(/\W+/g, "_")}.csv`, rows);
      }
      case "tax": {
        const job = await getJob(entityId, id);
        if (!job?.result) return NextResponse.json({ error: "Calcul introuvable" }, { status: 404 });
        // The stored run is the wire shape: amounts are exact strings, dates
        // are ISO. Rehydrating only the fields the CSV needs keeps the reader
        // honest about what it reports.
        const stored = job.result as unknown as { events?: Record<string, string>[]; currency?: string };
        const events: TaxableEvent[] = (stored.events ?? []).map((e) => ({
          id: String(e.id), txId: String(e.txId), date: new Date(e.date), asset: String(e.asset), qty: D(e.qty),
          disposalKind: e.disposalKind as TaxableEvent["disposalKind"],
          counterAsset: e.counterAsset ? String(e.counterAsset) : undefined,
          proceeds: D(e.proceeds), fees: D(e.fees), netProceeds: D(e.netProceeds), costBasis: D(e.costBasis), gain: D(e.gain),
          exempt: Boolean(e.exempt), exemptReason: e.exemptReason ? String(e.exemptReason) : undefined,
          holdingDays: e.holdingDays === undefined || e.holdingDays === null ? undefined : Number(e.holdingDays),
          warnings: [], extra: {}, trace: { key: "", label: "", inputs: [], refs: [], steps: [] },
        }));
        const csv = eventsCsv({ events, currency: stored.currency ?? "EUR" } as TaxComputationResult);
        return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="operations-${entity.name.replace(/\W+/g, "_")}.csv"` } });
      }
      default:
        return NextResponse.json({ error: "Export inconnu" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
