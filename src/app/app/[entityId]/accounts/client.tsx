"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, FileUp, KeyRound, MoreHorizontal, Plus, RefreshCw, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/misc";
import { JobPanel, useJob, type JobState } from "@/components/app/job-progress";
import { fmtDate, fmtNum } from "@/lib/utils";
import { addWalletAction, createAccountAction, deleteAccountAction, purgeAccountTransactionsAction, removeWalletAction, renameAccountAction, startSyncAction, testCredentialsAction, updateKeysAction } from "./actions";

interface AccountView { id: string; label: string; exchange: string; index: number; journalCode: string | null; hasApiKey: boolean; apiKeyHint: string | null; status: string; statusMessage: string | null; lastSyncAt: string | null; txCount: number }
interface WalletView { id: string; address: string; network: string | null; label: string | null; kind: string }
interface JobView { id: string; kind: string; status: string; progress: number; message: string | null; createdAt: string; accountId: string | null }

export function AccountsClient({ entityId, entityKind, canEdit, welcome, accounts, wallets, jobs }: { entityId: string; entityKind: string; canEdit: boolean; welcome: boolean; accounts: AccountView[]; wallets: WalletView[]; jobs: JobView[] }) {
  const [jobId, setJobId] = useState<string | null>(jobs.find((j) => j.status === "RUNNING")?.id ?? null);
  const job = useJob(entityId, jobId, (j) => { if (j.status === "DONE") toast.success("Traitement terminé"); else toast.error(j.message ?? "Échec"); });
  return (
    <div className="space-y-6">
      {welcome && accounts.length === 0 ? <Alert tone="info" title="Bienvenue ! Deux façons d'importer vos opérations.">Par clé API (lecture seule, synchronisation automatique) ou par export CSV « Transaction History » (Binance → Portefeuille → Historique des transactions → Exporter). {entityKind === "COMPANY" ? "Importez tout l'historique depuis l'ouverture du compte : le coût d'acquisition en dépend." : "Importez tout l'historique : le prix total d'acquisition de votre portefeuille en dépend."}</Alert> : null}
      {job ? <JobPanel job={job} /> : null}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Comptes d&apos;échange</h2>
        {canEdit ? <AddAccountDialog entityId={entityId} /> : null}
      </div>
      {accounts.length === 0 ? (
        <EmptyState icon={Wallet} title="Aucun compte" description="Ajoutez un compte Binance (clé API en lecture seule) ou un compte « import CSV » pour toute autre plateforme au format Binance." action={canEdit ? <AddAccountDialog entityId={entityId} /> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a) => <AccountCard key={a.id} account={a} entityId={entityId} canEdit={canEdit} onJob={setJobId} busy={Boolean(job && job.status === "RUNNING")} />)}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mes adresses (wallets personnels)</CardTitle>
          <CardDescription>Les dépôts et retraits vers ces adresses sont traités comme des transferts internes : pas de cession, seuls les frais de réseau sont comptabilisés.</CardDescription>
        </CardHeader>
        <CardContent>
          {wallets.length ? (
            <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
              {wallets.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Badge tone={w.kind === "SELF" ? "primary" : "neutral"}>{w.kind === "SELF" ? "Perso" : w.kind === "CUSTOMER" ? "Client" : w.kind === "SUPPLIER" ? "Fournisseur" : "Autre"}</Badge>
                  <span className="num min-w-0 flex-1 truncate">{w.address}</span>
                  <span className="text-xs text-fg-subtle">{w.network ?? ""} {w.label ? `· ${w.label}` : ""}</span>
                  {canEdit ? <WalletRemove entityId={entityId} id={w.id} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {canEdit ? <WalletForm entityId={entityId} /> : null}
        </CardContent>
      </Card>

      {jobs.length ? (
        <Card>
          <CardHeader><CardTitle>Derniers traitements</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-2">
                  <Badge tone={j.status === "DONE" ? "positive" : j.status === "FAILED" ? "negative" : j.status === "RUNNING" ? "info" : "neutral"}>{j.status === "DONE" ? "Terminé" : j.status === "FAILED" ? "Échec" : j.status === "RUNNING" ? `${j.progress}%` : "En attente"}</Badge>
                  <span className="text-fg-muted">{j.kind === "API_SYNC" ? "Synchronisation API" : j.kind === "JOURNAL" ? "Journal" : j.kind === "PRICING" ? "Calcul" : "Import"}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-subtle">{j.message}</span>
                  <span className="text-xs text-fg-subtle">{fmtDate(j.createdAt, true)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AccountCard({ account: a, entityId, canEdit, onJob, busy }: { account: AccountView; entityId: string; canEdit: boolean; onJob: (id: string) => void; busy: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sync = (exhaustive: boolean) => start(async () => {
    const r = await startSyncAction(entityId, a.id, { exhaustive });
    if (r.ok && r.id) { onJob(r.id); toast.info("Synchronisation lancée : cela peut prendre plusieurs minutes."); } else if (!r.ok) toast.error(r.error);
  });
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-soft text-warning"><Building2 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{a.label}</p>
              <Badge>{a.exchange === "BINANCE" ? "Binance" : "CSV générique"}</Badge>
              {a.hasApiKey ? <Badge tone="positive"><KeyRound className="h-3 w-3" /> API {a.apiKeyHint}</Badge> : <Badge tone="neutral">Sans clé API</Badge>}
              {a.status === "ERROR" ? <Badge tone="negative">Erreur</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-fg-muted">Journal {a.journalCode ?? `CR${a.index}`} · compte 5171{String(a.index).padStart(2, "0")} · {fmtNum(a.txCount, 0)} transactions · {a.lastSyncAt ? `synchronisé le ${fmtDate(a.lastSyncAt, true)}` : "jamais synchronisé"}</p>
            {a.statusMessage ? <p className="mt-1 text-xs text-negative">{a.statusMessage}</p> : null}
          </div>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <RenameDialog entityId={entityId} account={a} />
                <KeysDialog entityId={entityId} account={a} />
                <DropdownMenuItem onSelect={() => sync(true)} disabled={!a.hasApiKey || busy}><RefreshCw className="h-4 w-4" /> Synchronisation exhaustive (lente)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-negative" onSelect={async () => { if (!confirm("Supprimer les transactions importées par CSV de ce compte ?")) return; const r = await purgeAccountTransactionsAction(entityId, a.id, "binance_csv"); if (r.ok) toast.success(r.message); else toast.error(r.error); router.refresh(); }}><Trash2 className="h-4 w-4" /> Purger les imports CSV</DropdownMenuItem>
                <DropdownMenuItem className="text-negative" onSelect={async () => { if (!confirm(`Supprimer le compte « ${a.label} » et toutes ses transactions ?`)) return; const r = await deleteAccountAction(entityId, a.id); if (r.ok) toast.success(r.message); else toast.error(r.error); }}><Trash2 className="h-4 w-4" /> Supprimer le compte</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => sync(false)} disabled={!a.hasApiKey || busy} loading={pending}><RefreshCw className="h-4 w-4" /> Synchroniser (API)</Button>
            <ImportDialog entityId={entityId} account={a} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AddAccountDialog({ entityId }: { entityId: string }) {
  const [open, setOpen] = useState(false);
  const [exchange, setExchange] = useState<"BINANCE" | "GENERIC">("BINANCE");
  const [label, setLabel] = useState("Binance");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [test, setTest] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Ajouter un compte</Button></DialogTrigger>
      <DialogContent title="Nouveau compte d'échange" description="La clé API est facultative : sans clé, vous importerez des fichiers CSV.">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createAccountAction(entityId, { exchange, label, apiKey, apiSecret }); if (r.ok) { toast.success("Compte ajouté"); setOpen(false); router.refresh(); } else toast.error(r.error); }); }}>
          <Field label="Plateforme"><Select value={exchange} onChange={(e) => { const v = e.target.value as "BINANCE" | "GENERIC"; setExchange(v); setLabel(v === "BINANCE" ? "Binance" : "Autre plateforme"); }}><option value="BINANCE">Binance (API ou CSV)</option><option value="GENERIC">Autre plateforme (CSV au format Binance)</option></Select></Field>
          <Field label="Libellé" hint="Apparaît dans le libellé du journal et du compte 5171xx"><Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} /></Field>
          {exchange === "BINANCE" ? (
            <>
              <div className="rounded-lg bg-surface-2 p-3 text-xs text-fg-muted">
                <p className="flex items-center gap-1.5 font-medium text-fg"><ShieldCheck className="h-3.5 w-3.5 text-positive" /> Créez la clé avec « Enable Reading » uniquement</p>
                <p className="mt-1">Binance → Profil → Gestion des API → Créer une API (System generated). Ne cochez ni trading ni retraits, et restreignez si possible l&apos;accès à l&apos;adresse IP de votre serveur. Les clés sont chiffrées avant stockage.</p>
              </div>
              <Field label="Clé API (facultatif)"><Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} /></Field>
              <Field label="Secret API (facultatif)"><Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off" /></Field>
              {apiKey && apiSecret ? <Button type="button" variant="outline" size="sm" onClick={() => start(async () => { const r = await testCredentialsAction(apiKey, apiSecret); setTest(r.ok ? `✅ ${r.message}` : `❌ ${r.error}`); })}>Tester la connexion</Button> : null}
              {test ? <p className="text-xs">{test}</p> : null}
            </>
          ) : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Créer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KeysDialog({ entityId, account }: { entityId: string; account: AccountView }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState(""); const [apiSecret, setApiSecret] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}><KeyRound className="h-4 w-4" /> {account.hasApiKey ? "Remplacer la clé API" : "Ajouter une clé API"}</DropdownMenuItem>
      <DialogContent title="Clé API Binance" description="Lecture seule uniquement. La clé est testée avant d'être enregistrée.">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await updateKeysAction(entityId, account.id, apiKey, apiSecret); if (r.ok) { toast.success(r.message ?? "Clé enregistrée"); setOpen(false); } else toast.error(r.error); }); }}>
          <Field label="Clé API"><Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required autoComplete="off" /></Field>
          <Field label="Secret"><Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required autoComplete="off" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ entityId, account }: { entityId: string; account: AccountView }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(account.label); const [code, setCode] = useState(account.journalCode ?? `CR${account.index}`);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>Renommer / code journal</DropdownMenuItem>
      <DialogContent title="Modifier le compte">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await renameAccountAction(entityId, account.id, label, code); if (r.ok) { toast.success("Compte modifié"); setOpen(false); } else toast.error(r.error); }); }}>
          <Field label="Libellé"><Input value={label} onChange={(e) => setLabel(e.target.value)} required /></Field>
          <Field label="Code journal (FEC)" hint="Alphanumérique, 8 caractères max"><Input value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ entityId, account }: { entityId: string; account: AccountView }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ rowCount: number; inserted: number; skipped: number; ignoredRows: number; warnings: string[]; from?: string; to?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/entities/${entityId}/accounts/${account.id}/import`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import impossible");
      setSummary(json); toast.success(`${json.inserted} transaction(s) importée(s)`); router.refresh();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSummary(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><FileUp className="h-4 w-4" /> Importer un CSV</Button></DialogTrigger>
      <DialogContent title={`Import CSV — ${account.label}`} description="Export Binance « Transaction History » (colonnes User_ID, UTC_Time, Account, Operation, Coin, Change, Remark). Les lignes déjà connues sont ignorées : vous pouvez réimporter sans doublon.">
        {summary ? (
          <div className="space-y-3 text-sm">
            <Alert tone="positive" title={`${summary.inserted} nouvelle(s) transaction(s)`}>{summary.rowCount} lignes lues · {summary.skipped} déjà connues · {summary.ignoredRows} mouvements internes ignorés{summary.from ? ` · du ${fmtDate(summary.from)} au ${fmtDate(summary.to!)}` : ""}</Alert>
            {summary.warnings.length ? <Alert tone="warning" title="À vérifier"><ul className="list-disc pl-4">{summary.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul></Alert> : null}
            <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Fermer</Button></div>
          </div>
        ) : (
          <form onSubmit={upload} className="grid gap-4">
            <Input ref={fileRef} type="file" accept=".csv,text/csv" required className="h-auto py-2" />
            <p className="text-xs text-fg-subtle">Binance limite chaque export à 12 mois : exportez année par année et importez chaque fichier. 25 Mo max.</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={busy}>Importer</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WalletForm({ entityId }: { entityId: string }) {
  const [address, setAddress] = useState(""); const [network, setNetwork] = useState(""); const [label, setLabel] = useState(""); const [kind, setKind] = useState<"SELF" | "CUSTOMER" | "SUPPLIER" | "OTHER">("SELF");
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-3 md:grid-cols-[1fr_120px_160px_140px_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addWalletAction(entityId, { address, network, label, kind }); if (r.ok) { toast.success(r.message); setAddress(""); setLabel(""); } else toast.error(r.error); }); }}>
      <Field label="Adresse"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… / bc1… / T…" required className="num" /></Field>
      <Field label="Réseau"><Input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="ETH, BSC…" /></Field>
      <Field label="Libellé"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ledger, Metamask…" /></Field>
      <Field label="Nature"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="SELF">Mon wallet</option><option value="CUSTOMER">Client</option><option value="SUPPLIER">Fournisseur</option><option value="OTHER">Autre</option></Select></Field>
      <Button type="submit" loading={pending} variant="outline"><Plus className="h-4 w-4" /> Ajouter</Button>
    </form>
  );
}

function WalletRemove({ entityId, id }: { entityId: string; id: string }) {
  const [pending, start] = useTransition();
  return <Button variant="ghost" size="icon" aria-label="Retirer" loading={pending} onClick={() => start(async () => { const r = await removeWalletAction(entityId, id); if (!r.ok) toast.error(r.error); })}><Trash2 className="h-4 w-4" /></Button>;
}

export type { JobState };
