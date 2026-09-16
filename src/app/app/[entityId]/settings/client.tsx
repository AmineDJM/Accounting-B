"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Globe2, Scale, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, Table, Td, Th } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";
import { deleteEntityAction, inviteAction, removeMemberAction, revokeInvitationAction, updateChartAction, updateEntityAction, updateExternalHoldingsAction } from "./actions";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const ROLE_LABEL: Record<string, string> = { OWNER: "Propriétaire", ADMIN: "Administrateur", ACCOUNTANT: "Comptable", VIEWER: "Lecture seule" };

interface Props {
  entityId: string; role: string; currentUserId: string;
  entity: { name: string; kind: "COMPANY" | "INDIVIDUAL"; siren: string; legalForm: string; fiscalYearEndMonth: number; fiscalYearEndDay: number; costMethod: "CUMP" | "FIFO" };
  country: {
    code: string; name: string; flag: string; currency: string; timezone: string;
    framework: string; auditFile: string; draft: boolean; lastReviewed: string;
    costMethods: string[]; closingValuation: string; assumptions: string[];
  };
  chart: { key: string; description: string; number: string; label: string; defaultNumber: string }[];
  capitalizeFees: boolean;
  assetAccounts: { asset: string; number: string }[];
  externalHoldings: string;
  members: { userId: string; email: string | null; name: string | null; role: string; since: string }[];
  pending: { id: string; email: string; role: string; expiresAt: string; token: string }[];
}

export function SettingsClient(p: Props) {
  const canAdmin = p.role === "OWNER" || p.role === "ADMIN";
  return (
    <Tabs defaultValue="entity">
      <TabsList className="flex-wrap">
        <TabsTrigger value="entity">Dossier</TabsTrigger>
        <TabsTrigger value="country">Juridiction</TabsTrigger>
        {p.entity.kind === "COMPANY" ? <TabsTrigger value="chart">Plan de comptes</TabsTrigger> : <TabsTrigger value="external">Avoirs externes</TabsTrigger>}
        <TabsTrigger value="members">Collaborateurs</TabsTrigger>
        {p.role === "OWNER" ? <TabsTrigger value="danger">Zone de danger</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="entity"><EntityForm {...p} canAdmin={canAdmin} /></TabsContent>
      <TabsContent value="chart"><ChartForm {...p} canAdmin={canAdmin} /></TabsContent>
      <TabsContent value="external"><ExternalForm {...p} canAdmin={canAdmin} /></TabsContent>
      <TabsContent value="country">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-fg-subtle" /> {p.country.flag} {p.country.name}</CardTitle>
              <CardDescription>
                Le pays fixe le référentiel comptable, la devise des livres, le calendrier des dates, le fichier d&apos;audit et le régime d&apos;imposition. Il se choisit à la création du dossier et ne se change pas ensuite : les écritures déjà produites suivent le plan de comptes du pays d&apos;origine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-fg-muted">Référentiel comptable</dt><dd className="font-medium">{p.country.framework}</dd></div>
                <div><dt className="text-fg-muted">Devise des livres</dt><dd className="font-medium">{p.country.currency}</dd></div>
                <div><dt className="text-fg-muted">Fichier d&apos;audit</dt><dd className="font-medium">{p.country.auditFile}</dd></div>
                <div><dt className="text-fg-muted">Fuseau comptable</dt><dd className="font-medium">{p.country.timezone}</dd></div>
                <div className="sm:col-span-2"><dt className="text-fg-muted">Méthodes de coût admises</dt><dd className="font-medium">{p.country.costMethods.join(", ")}</dd></div>
              </dl>
              <p className="mt-4 border-t border-border pt-3 text-sm text-fg-muted">{p.country.closingValuation}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Scale className="h-4 w-4 text-fg-subtle" /> Hypothèses de ce jeu de règles</CardTitle>
              <CardDescription>
                {p.country.draft
                  ? `Encodé le ${fmtDate(p.country.lastReviewed)} à partir des textes cités, sans relecture par un professionnel de ${p.country.name}.`
                  : `Relu le ${fmtDate(p.country.lastReviewed)} par un professionnel de ${p.country.name}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {p.country.draft ? <Alert tone="warning" className="mb-3">Vérifiez ces points avant de produire une déclaration.</Alert> : null}
              <ul className="space-y-2 text-sm text-fg-muted">
                {p.country.assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" aria-hidden /><span>{a}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="members"><Members {...p} canAdmin={canAdmin} /></TabsContent>
      <TabsContent value="danger"><Danger entityId={p.entityId} name={p.entity.name} /></TabsContent>
    </Tabs>
  );
}

function EntityForm({ entityId, entity, canAdmin }: Props & { canAdmin: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader><CardTitle>Identité du dossier</CardTitle><CardDescription>Le SIREN nomme le FEC ; la date de clôture délimite les exercices ; la méthode de coût s&apos;applique à toutes les cessions (art. 619-15 PCG).</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; start(async () => { const r = await updateEntityAction(entityId, fd); if (r.ok) toast.success(r.message); else toast.error(r.error); }); }}>
          <Field label="Nom"><Input name="name" defaultValue={entity.name} required disabled={!canAdmin} /></Field>
          <Field label="Régime"><Select name="kind" defaultValue={entity.kind} disabled={!canAdmin}><option value="COMPANY">Entreprise (PCG / FEC)</option><option value="INDIVIDUAL">Particulier (150 VH bis)</option></Select></Field>
          <Field label="SIREN" hint="9 chiffres"><Input name="siren" defaultValue={entity.siren} inputMode="numeric" disabled={!canAdmin} /></Field>
          <Field label="Forme juridique"><Input name="legalForm" defaultValue={entity.legalForm} disabled={!canAdmin} /></Field>
          <Field label="Clôture de l'exercice">
            <div className="flex gap-2">
              <Select name="fiscalYearEndDay" defaultValue={String(entity.fiscalYearEndDay)} className="w-24" disabled={!canAdmin}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>
              <Select name="fiscalYearEndMonth" defaultValue={String(entity.fiscalYearEndMonth)} disabled={!canAdmin}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>
            </div>
          </Field>
          <Field label="Méthode de coût"><Select name="costMethod" defaultValue={entity.costMethod} disabled={!canAdmin}><option value="CUMP">Coût moyen pondéré (CUMP)</option><option value="FIFO">Premier entré, premier sorti (PEPS)</option></Select></Field>
          {canAdmin ? <div className="md:col-span-2 flex justify-end"><Button type="submit" loading={pending}>Enregistrer</Button></div> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function ChartForm({ entityId, chart, capitalizeFees, assetAccounts, canAdmin }: Props & { canAdmin: boolean }) {
  const [rows, setRows] = useState(chart);
  const [capitalize, setCapitalize] = useState(capitalizeFees);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Comptes utilisés</CardTitle><CardDescription>Valeurs par défaut conformes au PCG 2025 (règlement ANC 2018-07 consolidé). Adaptez les numéros au plan de votre cabinet si nécessaire.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <thead><tr><Th>Usage</Th><Th className="w-36">Numéro</Th><Th>Libellé</Th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.key}>
                <Td className="text-fg-muted">{r.description}{r.number !== r.defaultNumber ? <Badge tone="info" className="ml-2">modifié</Badge> : null}</Td>
                <Td><Input className="num h-8" value={r.number} disabled={!canAdmin} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, number: e.target.value } : x)))} /></Td>
                <Td><Input className="h-8" value={r.label} disabled={!canAdmin} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} /></Td>
              </tr>
            ))}</tbody>
          </Table>
          <label className="mt-4 flex items-center gap-3 text-sm"><Switch checked={capitalize} onCheckedChange={setCapitalize} disabled={!canAdmin} /> Incorporer les frais d&apos;acquisition au coût d&apos;entrée des jetons (au lieu de les passer en 6278)</label>
          {canAdmin ? <div className="mt-4 flex justify-end"><Button loading={pending} onClick={() => start(async () => { const r = await updateChartAction(entityId, Object.fromEntries(rows.map((x) => [x.key, { number: x.number, label: x.label }])), { capitalizeFees: capitalize }); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Enregistrer le plan de comptes</Button></div> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sous-comptes par actif</CardTitle><CardDescription>Attribués automatiquement à la première génération (522001, 522002…) et jamais modifiés ensuite, pour la continuité d&apos;un exercice à l&apos;autre.</CardDescription></CardHeader>
        <CardContent>{assetAccounts.length === 0 ? <p className="text-sm text-fg-subtle">Aucun sous-compte attribué pour l&apos;instant.</p> : <div className="flex flex-wrap gap-2">{assetAccounts.map((a) => <Badge key={a.asset}><span className="num">{a.number}</span> · {a.asset.replace("FIAT:", "devise ")}</Badge>)}</div>}</CardContent>
      </Card>
    </div>
  );
}

function ExternalForm({ entityId, externalHoldings, canAdmin }: Props & { canAdmin: boolean }) {
  const [text, setText] = useState(externalHoldings);
  const [pending, start] = useTransition();
  return (
    <Card id="external">
      <CardHeader><CardTitle>Avoirs hors des comptes importés</CardTitle><CardDescription>Pour l&apos;article 150 VH bis, la valeur globale du portefeuille inclut tous vos actifs numériques. Indiquez ici les quantités détenues ailleurs (wallets, autres plateformes), une par ligne : « BTC 0.25 ».</CardDescription></CardHeader>
      <CardContent>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"BTC 0.25\nETH 3"} className="num" disabled={!canAdmin} />
        <Alert tone="info" className="mt-3">Approximation : ces quantités sont considérées constantes sur toute la période. Pour un calcul exact, importez l&apos;historique de ces wallets comme comptes supplémentaires.</Alert>
        {canAdmin ? <div className="mt-4 flex justify-end"><Button loading={pending} onClick={() => start(async () => { const r = await updateExternalHoldingsAction(entityId, text); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Enregistrer</Button></div> : null}
      </CardContent>
    </Card>
  );
}

function Members({ entityId, members, pending: invites, canAdmin, currentUserId }: Props & { canAdmin: boolean }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"ADMIN" | "ACCOUNTANT" | "VIEWER">("ACCOUNTANT");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Collaborateurs</CardTitle><CardDescription>Invitez votre expert-comptable (rôle Comptable : qualification des opérations, génération du journal, exports) ou un associé.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <thead><tr><Th>Membre</Th><Th>Rôle</Th><Th>Depuis</Th><Th /></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.userId}><Td><span className="font-medium">{m.name ?? m.email}</span>{m.name ? <span className="ml-2 text-xs text-fg-subtle">{m.email}</span> : null}{m.userId === currentUserId ? <Badge className="ml-2">vous</Badge> : null}</Td><Td><Badge tone={m.role === "OWNER" ? "primary" : "neutral"}>{ROLE_LABEL[m.role]}</Badge></Td><Td className="text-fg-muted">{fmtDate(m.since)}</Td><Td className="text-right">{canAdmin && m.userId !== currentUserId ? <Button variant="ghost" size="icon" aria-label="Retirer" onClick={() => start(async () => { if (!confirm(`Retirer ${m.email} du dossier ?`)) return; const r = await removeMemberAction(entityId, m.userId); if (r.ok) toast.success(r.message); else toast.error(r.error); })}><Trash2 className="h-4 w-4" /></Button> : null}</Td></tr>
            ))}</tbody>
          </Table>
          {invites.length ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Invitations en attente</p>
              <ul className="mt-2 divide-y divide-border text-sm">{invites.map((i) => <li key={i.id} className="flex items-center gap-3 py-2"><span>{i.email}</span><Badge>{ROLE_LABEL[i.role]}</Badge><span className="text-xs text-fg-subtle">expire le {fmtDate(i.expiresAt)}</span><span className="ml-auto flex gap-1"><Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(`${location.origin}/app/invite/${i.token}`); toast.success("Lien copié"); }}><Copy className="h-4 w-4" /> Copier le lien</Button>{canAdmin ? <Button variant="ghost" size="icon" aria-label="Révoquer" onClick={() => start(async () => { const r = await revokeInvitationAction(entityId, i.id); if (!r.ok) toast.error(r.error); })}><Trash2 className="h-4 w-4" /></Button> : null}</span></li>)}</ul>
            </div>
          ) : null}
          {canAdmin ? (
            <form className="mt-5 flex flex-col gap-2 border-t border-border pt-4 md:flex-row md:items-end" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await inviteAction(entityId, email, role); if (r.ok) { toast.success(r.message); setLink(r.link ?? null); setEmail(""); } else toast.error(r.error); }); }}>
              <Field label="E-mail" className="flex-1"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cabinet@exemple.fr" required /></Field>
              <Field label="Rôle"><Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="ACCOUNTANT">Comptable</option><option value="ADMIN">Administrateur</option><option value="VIEWER">Lecture seule</option></Select></Field>
              <Button type="submit" loading={pending}><UserPlus className="h-4 w-4" /> Inviter</Button>
            </form>
          ) : null}
          {link ? <Alert tone="positive" className="mt-3" title="Invitation créée">Transmettez ce lien à la personne invitée (l&apos;envoi d&apos;e-mail n&apos;est pas encore configuré) : <span className="num break-all">{link}</span></Alert> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Danger({ entityId, name }: { entityId: string; name: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card className="border-negative/40">
      <CardHeader><CardTitle className="text-negative">Supprimer le dossier</CardTitle><CardDescription>Supprime définitivement les comptes, transactions, journaux et exports de « {name} ». Cette action est irréversible.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field label={`Tapez « ${name} » pour confirmer`} className="flex-1"><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
        <Button variant="danger" disabled={confirmText !== name} loading={pending} onClick={() => start(async () => { const r = await deleteEntityAction(entityId); if (r && !r.ok) toast.error(r.error); })}><Trash2 className="h-4 w-4" /> Supprimer définitivement</Button>
      </CardContent>
    </Card>
  );
}
