"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, Eye, Globe2, NotebookPen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Alert, Table, Td, Th } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";
import { setCountriesAction, setNoteAction, setRoleAction, setStatusAction, viewAsAction } from "../../actions";
import type { AccountView } from "../client";

export function AccountDetailClient({
  account, countries, files, orphaned, isSelf,
}: {
  account: AccountView;
  countries: { code: string; name: string; flag: string; summary: string; reviewed: boolean }[];
  files: { id: string; name: string; kind: string; country: string; countryName: string; flag: string; currency: string; role: string; transactions: number; createdAt: string; fiscalYears: number }[];
  orphaned: string[];
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>(account.countries);
  const [note, setNote] = useState(account.adminNote ?? "");
  const [reason, setReason] = useState("");
  const dirty = selected.slice().sort().join(",") !== account.countries.slice().sort().join(",");

  const toggle = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-fg-subtle" aria-hidden /> Pays ouverts</CardTitle>
            <CardDescription>
              Les juridictions dans lesquelles ce compte peut ouvrir un dossier. Retirer un pays n&apos;efface aucun dossier existant : il empêche d&apos;en créer de nouveaux.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {orphaned.length ? (
              <Alert tone="warning" title="Dossiers hors périmètre">
                Ce compte possède des dossiers dans {orphaned.join(", ")}, qui ne figurent plus parmi les pays ouverts. Les dossiers restent consultables ; aucun nouveau ne peut être créé sous ces règles.
              </Alert>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {countries.map((c) => {
                const on = selected.includes(c.code);
                return (
                  <label
                    key={c.code}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${on ? "border-primary bg-primary-soft/40" : "border-border hover:bg-surface-2"}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(c.code)} className="mt-0.5 h-4 w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <span aria-hidden>{c.flag}</span> {c.name}
                        {!c.reviewed ? <Badge tone="warning">non relues</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{c.summary}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!dirty}
                loading={pending}
                onClick={() => start(async () => {
                  const r = await setCountriesAction(account.id, selected);
                  if (r.ok) toast.success(r.message ?? "Pays enregistrés"); else toast.error(r.error);
                })}
              >
                Enregistrer les pays
              </Button>
              <Button variant="ghost" onClick={() => setSelected(countries.map((c) => c.code))}>Tout ouvrir</Button>
              <Button variant="ghost" onClick={() => setSelected([])}>Tout fermer</Button>
              {dirty ? <span className="text-xs text-warning">Modifications non enregistrées</span> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>État du compte</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt className="text-fg-muted">Statut</dt><dd>{account.status === "ACTIVE" ? <Badge tone="positive">Actif</Badge> : account.status === "INVITED" ? <Badge tone="warning">En attente</Badge> : <Badge tone="negative">Désactivé</Badge>}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-muted">Rôle</dt><dd>{account.role === "SUPER_ADMIN" ? <Badge tone="primary">Administrateur</Badge> : <Badge>Utilisateur</Badge>}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-muted">Créé le</dt><dd>{fmtDate(account.createdAt)}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-muted">Activé le</dt><dd>{account.activatedAt ? fmtDate(account.activatedAt) : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-muted">Dernière visite</dt><dd>{account.lastSeenAt ? fmtDate(account.lastSeenAt, true) : "jamais"}</dd></div>
              </dl>
              {isSelf ? (
                <p className="text-xs text-fg-subtle">Vous ne pouvez ni désactiver votre propre compte ni retirer vos droits : demandez à un autre administrateur.</p>
              ) : (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {account.status === "ACTIVE" ? (
                    <Button size="sm" variant="outline" loading={pending} onClick={() => start(async () => {
                      const r = await setStatusAction(account.id, "SUSPENDED", "Désactivé depuis la fiche du compte");
                      if (r.ok) toast.success(r.message ?? "Compte désactivé"); else toast.error(r.error);
                    })}><Ban className="h-4 w-4" /> Désactiver</Button>
                  ) : (
                    <Button size="sm" loading={pending} onClick={() => start(async () => {
                      const r = await setStatusAction(account.id, "ACTIVE");
                      if (r.ok) toast.success(r.message ?? "Compte activé"); else toast.error(r.error);
                    })}><CheckCircle2 className="h-4 w-4" /> Activer</Button>
                  )}
                  <Button size="sm" variant="ghost" loading={pending} onClick={() => start(async () => {
                    const next = account.role === "SUPER_ADMIN" ? "USER" : "SUPER_ADMIN";
                    const r = await setRoleAction(account.id, next);
                    if (r.ok) toast.success(r.message ?? "Rôle modifié"); else toast.error(r.error);
                  })}>
                    <ShieldCheck className="h-4 w-4" /> {account.role === "SUPER_ADMIN" ? "Retirer l'administration" : "Passer administrateur"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4 text-fg-subtle" aria-hidden /> Voir comme ce compte</CardTitle>
              <CardDescription>
                Ouvre l&apos;application telle que ce compte la voit, en lecture seule et pendant une heure. Le motif est enregistré et communicable au titulaire.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif : ticket #412, journal 2025 déséquilibré"
                aria-label="Motif de la consultation"
              />
              <Button
                className="w-full"
                variant="outline"
                disabled={isSelf || reason.trim().length < 8 || account.status !== "ACTIVE"}
                loading={pending}
                onClick={() => start(async () => {
                  const r = await viewAsAction(account.id, reason);
                  if (r && !r.ok) toast.error(r.error);
                })}
              >
                <Eye className="h-4 w-4" /> Ouvrir en lecture seule
              </Button>
              {account.status !== "ACTIVE" ? <p className="text-xs text-fg-subtle">Réactivez le compte pour le consulter.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dossiers de ce compte</CardTitle>
            <CardDescription>{files.length} dossier(s) · {files.reduce((a, f) => a + f.transactions, 0).toLocaleString("fr-FR")} opération(s)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead><tr><Th>Dossier</Th><Th>Pays</Th><Th>Rôle</Th><Th className="text-right">Opérations</Th><Th className="text-right">Exercices</Th></tr></thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <Td>
                      <Link href={`/app/${f.id}/dashboard`} className="font-medium hover:underline">{f.name}</Link>
                      <span className="block text-xs text-fg-subtle">{f.kind === "COMPANY" ? "Entreprise" : "Particulier"} · créé le {fmtDate(f.createdAt)}</span>
                    </Td>
                    <Td><span className="mr-1" aria-hidden>{f.flag}</span>{f.countryName} <span className="text-xs text-fg-subtle">{f.currency}</span></Td>
                    <Td className="text-xs text-fg-muted">{f.role}</Td>
                    <Td className="text-right num tabular">{f.transactions.toLocaleString("fr-FR")}</Td>
                    <Td className="text-right num tabular">{f.fiscalYears}</Td>
                  </tr>
                ))}
                {files.length === 0 ? <tr><Td colSpan={5} className="text-fg-subtle">Ce compte n&apos;a encore ouvert aucun dossier.</Td></tr> : null}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-fg-subtle" aria-hidden /> Note interne</CardTitle>
            <CardDescription>Visible des seuls administrateurs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contrat, contact, particularités du dossier…" />
            <Button
              size="sm"
              variant="outline"
              loading={pending}
              onClick={() => start(async () => {
                const r = await setNoteAction(account.id, note);
                if (r.ok) toast.success("Note enregistrée"); else toast.error(r.error);
              })}
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      </div>

      {account.usage.entities === 0 && account.status === "ACTIVE" && account.countries.length === 0 ? (
        <Alert tone="warning" title="Compte actif sans pays ouvert">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            Ce compte peut se connecter mais ne peut créer aucun dossier. Ouvrez au moins une juridiction ci-dessus.
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
