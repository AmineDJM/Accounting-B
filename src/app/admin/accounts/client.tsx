"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, CheckCircle2, Plus, Search, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";
import { createAccountAction, setStatusAction } from "../actions";

export interface AccountView {
  id: string; email: string | null; name: string | null; company: string | null;
  role: "SUPER_ADMIN" | "USER"; status: "INVITED" | "ACTIVE" | "SUSPENDED";
  countries: string[]; createdAt: string; activatedAt: string | null; lastSeenAt: string | null;
  suspendedReason: string | null; adminNote: string | null;
  usage: { entities: number; transactions: number; taxRuns: number; journalRuns: number; reconciliations: number };
}

const STATUS: Record<AccountView["status"], { label: string; tone: "positive" | "warning" | "negative" }> = {
  ACTIVE: { label: "Actif", tone: "positive" },
  INVITED: { label: "En attente", tone: "warning" },
  SUSPENDED: { label: "Désactivé", tone: "negative" },
};

export function AccountsClient({
  accounts, countries, currentAdminId,
}: {
  accounts: AccountView[];
  countries: { code: string; name: string; flag: string }[];
  currentAdminId: string;
}) {
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | AccountView["status"]>("ALL");
  const [creating, setCreating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter !== "ALL" && a.status !== filter) return false;
      if (!q) return true;
      return [a.email, a.name, a.company, ...a.countries].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [accounts, query, filter]);

  const counts = useMemo(
    () => ({
      ALL: accounts.length,
      ACTIVE: accounts.filter((a) => a.status === "ACTIVE").length,
      INVITED: accounts.filter((a) => a.status === "INVITED").length,
      SUSPENDED: accounts.filter((a) => a.status === "SUSPENDED").length,
    }),
    [accounts],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un compte, une société, un pays…" className="w-72 pl-8" aria-label="Rechercher un compte" />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["ALL", "ACTIVE", "INVITED", "SUSPENDED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${filter === f ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-fg-muted hover:bg-surface-2"}`}
            >
              {f === "ALL" ? "Tous" : STATUS[f].label} <span className="text-xs text-fg-subtle">{counts[f]}</span>
            </button>
          ))}
        </div>
        <Button className="ml-auto" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> Nouveau compte
        </Button>
      </div>

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-fg-subtle" aria-hidden /> Créer un compte</CardTitle>
            <CardDescription>
              L&apos;adresse doit correspondre au compte Google utilisé pour se connecter. Tant qu&apos;aucun pays n&apos;est ouvert, le compte peut se connecter mais ne peut créer aucun dossier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              ref={formRef}
              action={(fd) =>
                start(async () => {
                  const r = await createAccountAction(fd);
                  if (r.ok) { toast.success(r.message ?? "Compte créé"); formRef.current?.reset(); setCreating(false); }
                  else toast.error(r.error);
                })
              }
              className="grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm">
                <span className="mb-1 block font-medium">Adresse e-mail</span>
                <Input name="email" type="email" required placeholder="prenom.nom@cabinet.fr" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Nom</span>
                <Input name="name" placeholder="Prénom Nom" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Cabinet ou société</span>
                <Input name="company" placeholder="Cabinet Exemple & Associés" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Rôle</span>
                <select name="role" className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm">
                  <option value="USER">Utilisateur</option>
                  <option value="SUPER_ADMIN">Administrateur de la plateforme</option>
                </select>
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-sm font-medium">Pays ouverts</legend>
                <div className="flex flex-wrap gap-2">
                  {countries.map((c) => (
                    <label key={c.code} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-surface-2">
                      <input type="checkbox" name="countries" value={c.code} className="h-3.5 w-3.5" />
                      <span aria-hidden>{c.flag}</span> {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">Note interne</span>
                <Input name="note" placeholder="Contrat, contact, particularités du dossier…" />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="activate" defaultChecked className="h-4 w-4" />
                <span>Activer immédiatement — sinon le compte reste en attente et ne peut pas se connecter</span>
              </label>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" loading={pending}>Créer le compte</Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th>Compte</Th><Th>État</Th><Th>Pays ouverts</Th>
            <Th className="text-right">Dossiers</Th><Th className="text-right">Opérations</Th>
            <Th>Dernière visite</Th><Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-surface-2">
              <Td>
                <Link href={`/admin/accounts/${a.id}`} className="font-medium hover:underline">{a.email}</Link>
                <span className="block text-xs text-fg-subtle">
                  {a.name}{a.company ? ` · ${a.company}` : ""}
                  {a.role === "SUPER_ADMIN" ? <Badge tone="primary" className="ml-2"><ShieldCheck className="h-3 w-3" aria-hidden /> admin</Badge> : null}
                </span>
              </Td>
              <Td>
                <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                {a.suspendedReason ? <span className="ml-2 text-xs text-fg-subtle">{a.suspendedReason}</span> : null}
              </Td>
              <Td>
                {a.countries.length === 0 ? (
                  <span className="text-xs text-fg-subtle">aucun</span>
                ) : (
                  <span className="text-sm" title={a.countries.join(", ")}>
                    {a.countries.slice(0, 6).map((c) => countries.find((x) => x.code === c)?.flag ?? c).join(" ")}
                    {a.countries.length > 6 ? <span className="ml-1 text-xs text-fg-subtle">+{a.countries.length - 6}</span> : null}
                  </span>
                )}
              </Td>
              <Td className="text-right num tabular">{a.usage.entities || "—"}</Td>
              <Td className="text-right num tabular">{a.usage.transactions ? new Intl.NumberFormat("fr-FR").format(a.usage.transactions) : "—"}</Td>
              <Td className="whitespace-nowrap text-xs text-fg-muted">{a.lastSeenAt ? fmtDate(a.lastSeenAt, true) : "jamais"}</Td>
              <Td className="text-right">
                {a.id === currentAdminId ? (
                  <span className="text-xs text-fg-subtle">vous</span>
                ) : a.status === "SUSPENDED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={pending}
                    onClick={() => start(async () => {
                      const r = await setStatusAction(a.id, "ACTIVE");
                      if (r.ok) toast.success(r.message ?? "Compte activé"); else toast.error(r.error);
                    })}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Réactiver
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => start(async () => {
                      const r = await setStatusAction(a.id, "SUSPENDED", "Désactivé depuis la liste des comptes");
                      if (r.ok) toast.success(r.message ?? "Compte désactivé"); else toast.error(r.error);
                    })}
                  >
                    <Ban className="h-4 w-4" /> Désactiver
                  </Button>
                )}
              </Td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><Td colSpan={7} className="text-fg-subtle">Aucun compte ne correspond.</Td></tr> : null}
        </tbody>
      </Table>
    </div>
  );
}
