"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Filter, Plus, Repeat, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Table, Td, Th } from "@/components/ui/misc";
import { CATEGORY_LABELS, CATEGORY_OPTIONS_DEPOSIT, CATEGORY_OPTIONS_WITHDRAWAL, TX_TYPE_LABELS, cn, fmtDate, fmtNum } from "@/lib/utils";
import { bulkCategorizeAction, categorizeAction, createManualAction, deleteManualAction } from "./actions";

export interface TxView { id: string; accountId: string; source: string; timestamp: string; type: string; category: string; legs: { asset: string; amount: string; role: "IN" | "OUT" | "FEE" }[]; counterparty: { kind: string; address?: string; network?: string; txHash?: string; label?: string } | null; ref: string | null; note: string | null; reviewStatus: string }

const TYPE_TONE: Record<string, "primary" | "positive" | "negative" | "info" | "neutral" | "warning"> = { TRADE: "primary", FIAT_DEPOSIT: "positive", FIAT_WITHDRAWAL: "negative", CRYPTO_DEPOSIT: "positive", CRYPTO_WITHDRAWAL: "negative", REWARD: "info", ADJUSTMENT: "warning", FEE: "neutral" };

function categoryOptions(type: string): readonly string[] {
  if (type === "CRYPTO_DEPOSIT") return CATEGORY_OPTIONS_DEPOSIT;
  if (type === "CRYPTO_WITHDRAWAL") return CATEGORY_OPTIONS_WITHDRAWAL;
  if (type === "REWARD") return ["STAKING_INCOME", "AIRDROP"];
  if (type === "TRADE") return ["TRADE"];
  return ["BANK_TRANSFER"];
}

export function TransactionsClient({ entityId, rows, total, page, pageSize, filters, accounts, canEdit }: { entityId: string; rows: TxView[]; total: number; page: number; pageSize: number; filters: Record<string, string | undefined>; accounts: { id: string; label: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<TxView | null>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) p.set(k, v);
    return `/app/${entityId}/transactions?${p.toString()}`;
  };
  const accountLabel = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.label])), [accounts]);
  const selectable = rows.filter((r) => r.type === "CRYPTO_DEPOSIT" || r.type === "CRYPTO_WITHDRAWAL");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <form className="grid gap-2 rounded-[var(--radius)] border border-border bg-surface p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]" action={`/app/${entityId}/transactions`}>
        <Input name="q" defaultValue={filters.q ?? ""} placeholder="Référence, note, adresse…" />
        <Select name="type" defaultValue={filters.type ?? ""}><option value="">Tous types</option>{Object.entries(TX_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select name="reviewStatus" defaultValue={filters.reviewStatus ?? ""}><option value="">Tous statuts</option><option value="FLAGGED">À qualifier</option><option value="REVIEWED">Vérifiées</option><option value="AUTO">Automatiques</option></Select>
        <Select name="accountId" defaultValue={filters.accountId ?? ""}><option value="">Tous comptes</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
        <Input name="asset" defaultValue={filters.asset ?? ""} placeholder="Actif (BTC…)" className="uppercase" />
        <div className="flex gap-2"><Button type="submit" variant="outline"><Filter className="h-4 w-4" /> Filtrer</Button>{canEdit ? <ManualDialog entityId={entityId} accounts={accounts} /> : null}</div>
      </form>

      {selected.size > 0 && canEdit ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm">
          <Tags className="h-4 w-4 text-primary" /> {selected.size} sélectionnée(s) →
          {["INTERNAL_TRANSFER", "PURCHASE_GOODS", "CUSTOMER_RECEIPT", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL", "STAKING_INCOME"].map((c) => (
            <Button key={c} size="sm" variant="outline" loading={pending} onClick={() => start(async () => { const r = await bulkCategorizeAction(entityId, [...selected], c); if (r.ok) { toast.success(r.message); setSelected(new Set()); router.refresh(); } else toast.error(r.error); })}>{CATEGORY_LABELS[c]}</Button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? <EmptyState title="Aucune transaction" description="Modifiez les filtres ou importez des données depuis la page Comptes & imports." /> : (
        <Table>
          <thead>
            <tr>
              {canEdit ? <Th className="w-8"><input type="checkbox" aria-label="Tout sélectionner" checked={selectable.length > 0 && selected.size === selectable.length} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} /></Th> : null}
              <Th>Date</Th><Th>Type</Th><Th>Mouvements</Th><Th>Catégorie</Th><Th className="hidden lg:table-cell">Contrepartie / référence</Th><Th className="hidden md:table-cell">Compte</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const flagged = r.reviewStatus === "FLAGGED";
              const ins = r.legs.filter((l) => l.role === "IN"), outs = r.legs.filter((l) => l.role === "OUT"), fees = r.legs.filter((l) => l.role === "FEE");
              return (
                <tr key={r.id} className={cn("cursor-pointer hover:bg-surface-2", flagged && "bg-warning-soft/30")} onClick={() => setActive(r)}>
                  {canEdit ? <Td onClick={(e) => e.stopPropagation()}>{selectable.includes(r) ? <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSelected(s); }} aria-label="Sélectionner" /> : null}</Td> : null}
                  <Td className="whitespace-nowrap text-fg-muted">{fmtDate(r.timestamp, true)}</Td>
                  <Td><Badge tone={TYPE_TONE[r.type] ?? "neutral"}>{TX_TYPE_LABELS[r.type] ?? r.type}</Badge></Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {outs.map((l, i) => <span key={`o${i}`} className="num inline-flex items-center gap-1 text-negative"><ArrowUpRight className="h-3.5 w-3.5" />{fmtNum(l.amount)} {l.asset}</span>)}
                      {outs.length && ins.length ? <Repeat className="h-3.5 w-3.5 text-fg-subtle" /> : null}
                      {ins.map((l, i) => <span key={`i${i}`} className="num inline-flex items-center gap-1 text-positive"><ArrowDownLeft className="h-3.5 w-3.5" />{fmtNum(l.amount)} {l.asset}</span>)}
                      {fees.map((l, i) => <span key={`f${i}`} className="num text-xs text-fg-subtle">frais {fmtNum(l.amount)} {l.asset}</span>)}
                    </div>
                  </Td>
                  <Td>{flagged ? <Badge tone="warning">À qualifier</Badge> : <span className="text-fg-muted">{CATEGORY_LABELS[r.category] ?? r.category}</span>}</Td>
                  <Td className="hidden max-w-[220px] truncate text-xs text-fg-subtle lg:table-cell">{r.counterparty?.address ? <span className="num">{r.counterparty.address.slice(0, 10)}…{r.counterparty.address.slice(-6)}</span> : r.ref}</Td>
                  <Td className="hidden text-xs text-fg-subtle md:table-cell">{accountLabel[r.accountId] ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <div className="flex items-center justify-between text-sm text-fg-muted">
        <span>{fmtNum(total, 0)} opération(s) · page {page} / {pages}</span>
        <div className="flex gap-1">
          <Link href={qs({ page: String(Math.max(1, page - 1)) })} aria-disabled={page <= 1}><Button variant="outline" size="sm" disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button></Link>
          <Link href={qs({ page: String(Math.min(pages, page + 1)) })}><Button variant="outline" size="sm" disabled={page >= pages}><ChevronRight className="h-4 w-4" /></Button></Link>
        </div>
      </div>

      <Dialog open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        {active ? <TxDetail tx={active} entityId={entityId} canEdit={canEdit} accountLabel={accountLabel[active.accountId]} onClose={() => setActive(null)} /> : null}
      </Dialog>
    </div>
  );
}

function TxDetail({ tx, entityId, canEdit, accountLabel, onClose }: { tx: TxView; entityId: string; canEdit: boolean; accountLabel?: string; onClose: () => void }) {
  const [category, setCategory] = useState(tx.category);
  const [note, setNote] = useState(tx.note ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const options = categoryOptions(tx.type);
  const editable = canEdit && (tx.type === "CRYPTO_DEPOSIT" || tx.type === "CRYPTO_WITHDRAWAL" || tx.type === "REWARD");
  return (
    <DialogContent side="right" title={TX_TYPE_LABELS[tx.type] ?? tx.type} description={`${fmtDate(tx.timestamp, true)} · ${accountLabel ?? ""} · source ${tx.source.replace("_", " ")}`}>
      <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <dt className="text-fg-subtle">Mouvements</dt>
        <dd className="space-y-0.5">{tx.legs.map((l, i) => <div key={i} className={cn("num", l.role === "IN" ? "text-positive" : l.role === "OUT" ? "text-negative" : "text-fg-muted")}>{l.role === "IN" ? "+" : "−"} {fmtNum(l.amount)} {l.asset}{l.role === "FEE" ? " (frais)" : ""}</div>)}</dd>
        {tx.ref ? <><dt className="text-fg-subtle">Référence</dt><dd className="num break-all">{tx.ref}</dd></> : null}
        {tx.counterparty?.address ? <><dt className="text-fg-subtle">Adresse</dt><dd className="num break-all">{tx.counterparty.address}{tx.counterparty.network ? ` (${tx.counterparty.network})` : ""}</dd></> : null}
        {tx.counterparty?.txHash ? <><dt className="text-fg-subtle">Hash</dt><dd className="num break-all text-xs">{tx.counterparty.txHash}</dd></> : null}
        {tx.counterparty?.label ? <><dt className="text-fg-subtle">Via</dt><dd>{tx.counterparty.label}</dd></> : null}
      </dl>
      <div className="border-t border-border pt-4">
        {editable ? (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await categorizeAction(entityId, tx.id, { category, note }); if (r.ok) { toast.success(r.message); onClose(); router.refresh(); } else toast.error(r.error); }); }}>
            <Field label="Nature de l'opération" hint={category === "INTERNAL_TRANSFER" ? "Aucune cession : seuls les frais de réseau sont comptabilisés." : category === "PURCHASE_GOODS" ? "Compte 401 Fournisseurs, avec plus ou moins-value sur les jetons utilisés (particulier : cession imposable)." : category === "CUSTOMER_RECEIPT" ? "Compte 411 Clients, entrée des jetons à leur valeur du jour." : category === "UNKNOWN" ? "Reste en compte d'attente 471 tant que non qualifiée." : undefined}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>{options.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select>
            </Field>
            <Field label="Note (facultatif)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facture n°…, fournisseur, contexte" /></Field>
            <div className="flex items-center justify-between">
              {tx.source === "manual" ? <Button type="button" variant="ghost" className="text-negative" onClick={() => start(async () => { if (!confirm("Supprimer cette opération manuelle ?")) return; const r = await deleteManualAction(entityId, tx.id); if (r.ok) { toast.success(r.message); onClose(); router.refresh(); } else toast.error(r.error); })}><Trash2 className="h-4 w-4" /> Supprimer</Button> : <span />}
              <Button type="submit" loading={pending}>Enregistrer</Button>
            </div>
          </form>
        ) : <p className="text-sm text-fg-muted">Catégorie : {CATEGORY_LABELS[tx.category] ?? tx.category}{tx.note ? ` — ${tx.note}` : ""}</p>}
      </div>
    </DialogContent>
  );
}

function ManualDialog({ entityId, accounts }: { entityId: string; accounts: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("CRYPTO_DEPOSIT");
  const [pending, start] = useTransition();
  const router = useRouter();
  const options = categoryOptions(type);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Plus className="h-4 w-4" /> Manuelle</Button></DialogTrigger>
      <DialogContent title="Ajouter une opération manuelle" description="Pour une opération absente des imports (wallet externe, ancienne plateforme, correction).">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await createManualAction(entityId, Object.fromEntries(fd) as never); if (r.ok) { toast.success(r.message); setOpen(false); router.refresh(); } else toast.error(r.error); }); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Compte"><Select name="accountId" required>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
            <Field label="Date et heure (UTC)"><Input name="timestamp" type="datetime-local" required /></Field>
            <Field label="Type"><Select name="type" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TX_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Catégorie"><Select name="category" defaultValue={options[0]}>{options.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sortie (actif)"><Input name="outAsset" placeholder="BTC" className="uppercase" /></Field>
            <Field label="Quantité sortie"><Input name="outAmount" inputMode="decimal" placeholder="0.5" /></Field>
            <div />
            <Field label="Entrée (actif)"><Input name="inAsset" placeholder="EUR" className="uppercase" /></Field>
            <Field label="Quantité entrée"><Input name="inAmount" inputMode="decimal" placeholder="12000" /></Field>
            <div />
            <Field label="Frais (actif)"><Input name="feeAsset" placeholder="BNB" className="uppercase" /></Field>
            <Field label="Montant des frais"><Input name="feeAmount" inputMode="decimal" placeholder="0.001" /></Field>
          </div>
          <Field label="Adresse / contrepartie"><Input name="address" placeholder="0x… (facultatif)" /></Field>
          <Field label="Référence (pièce justificative)"><Input name="ref" placeholder="Facture, hash, n° d'ordre" /></Field>
          <Field label="Note"><Input name="note" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Ajouter</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
