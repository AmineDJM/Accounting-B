"use client";
import { useActionState, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createEntityAction, type ActionState } from "../actions";

export interface CountryChoice { code: string; name: string; flag: string; currency: string; regime: "GAINS" | "WEALTH"; summary: string; reviewed: boolean; dac8: boolean }

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function OnboardingWizard({ first, userName, countries }: { first: boolean; userName: string | null; countries: CountryChoice[] }) {
  const [kind, setKind] = useState<"COMPANY" | "INDIVIDUAL" | null>(null);
  const [country, setCountry] = useState<string>("FR");
  const [step, setStep] = useState(0);
  const picked = countries.find((c) => c.code === country) ?? countries[0];
  const [state, action, pending] = useActionState<ActionState, FormData>(createEntityAction, undefined);
  const thisYear = new Date().getUTCFullYear();

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] md:p-8">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">{first ? `Bienvenue${userName ? `, ${userName.split(" ")[0]}` : ""}` : "Nouveau dossier"}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {step === 0 ? "Pour qui tenons-nous ces comptes ?" : step === 1 ? "Quel pays régit ce dossier ?" : kind === "COMPANY" ? "Votre société" : "Votre dossier personnel"}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        {step === 0
          ? "Le type de dossier détermine ce qui est produit : un journal comptable et un fichier des écritures pour une entreprise, le calcul de l'impôt personnel pour un particulier."
          : step === 1
            ? "Le pays décide de tout le reste : le plan de comptes, la devise des livres, le calendrier des dates, le fichier d'audit attendu et le régime d'imposition appliqué."
            : "Ces informations figurent dans les fichiers produits. Vous pourrez les modifier plus tard."}
      </p>

      {step === 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            { k: "COMPANY" as const, icon: Building2, title: "Entreprise", text: "SAS, SARL, EURL, association, holding… Journal comptable, balance, écritures d'inventaire et FEC." },
            { k: "INDIVIDUAL" as const, icon: UserRound, title: "Particulier", text: "Plus-values sur actifs numériques, formulaire 2086, seuil de 305 €, comptes à déclarer (3916-bis)." },
          ].map((o) => (
            <button key={o.k} type="button" onClick={() => setKind(o.k)} className={cn("rounded-[var(--radius)] border-2 p-5 text-left transition-colors hover:bg-surface-2", kind === o.k ? "border-primary bg-primary-soft/40" : "border-border")}>
              <o.icon className={cn("h-6 w-6", kind === o.k ? "text-primary" : "text-fg-muted")} />
              <p className="mt-3 font-semibold">{o.title}</p>
              <p className="mt-1 text-sm text-fg-muted">{o.text}</p>
            </button>
          ))}
          <div className="sm:col-span-2 flex justify-end">
            <Button disabled={!kind} onClick={() => setStep(1)}>Continuer <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : step === 1 ? (
        <div className="mt-6">
          <div className="grid gap-2 sm:grid-cols-2">
            {countries.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCountry(c.code)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors hover:bg-surface-2",
                  country === c.code ? "border-primary bg-primary-soft/40" : "border-border",
                )}
              >
                <span className="text-xl leading-none" aria-hidden>{c.flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-fg-subtle">{c.currency}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{c.summary}</span>
                </span>
              </button>
            ))}
          </div>
          {picked ? (
            <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
              <p className="text-fg-muted">
                {picked.dac8
                  ? "Ce pays applique DAC8 : les prestataires y déclarent vos opérations à l'administration, et le rapprochement est disponible dans le dossier."
                  : "Ce pays n'applique pas DAC8, mais un prestataire établi dans l'Union déclarera tout de même les opérations qu'il exécute pour vous."}
              </p>
              {!picked.reviewed ? (
                <p className="mt-2 text-fg-muted">
                  Les règles de ce pays sont encodées à partir des textes cités et n&apos;ont pas encore été relues par un professionnel local. Les hypothèses retenues sont affichées sur chaque calcul.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="h-4 w-4" /> Retour</Button>
            <Button onClick={() => setStep(2)}>Continuer <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : (
        <form action={action} className="mt-6 grid gap-4">
          <input type="hidden" name="kind" value={kind ?? "COMPANY"} />
          <input type="hidden" name="country" value={country} />
          <Field label={kind === "COMPANY" ? "Dénomination sociale" : "Nom du dossier"} error={state?.fieldErrors?.name}>
            <Input name="name" required placeholder={kind === "COMPANY" ? "Ma Société SAS" : "Prénom Nom"} autoFocus />
          </Field>
          {kind === "COMPANY" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {country === "FR" ? (
                <Field label="SIREN" hint="9 chiffres, il donne son nom au fichier des écritures" error={state?.fieldErrors?.siren}><Input name="siren" inputMode="numeric" placeholder="123456789" /></Field>
              ) : (
                <Field label="Numéro d'identification" hint="NIPC, KvK, UID, Steuernummer… il figure dans le fichier d'audit">
                  <Input name="taxId" placeholder="Identifiant national" />
                </Field>
              )}
              <Field label="Forme juridique"><Input name="legalForm" placeholder="SAS, SARL, EURL…" /></Field>
              <Field label="Clôture de l'exercice">
                <div className="flex gap-2">
                  <Select name="fiscalYearEndDay" defaultValue="31" className="w-24">{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>
                  <Select name="fiscalYearEndMonth" defaultValue="12">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>
                </div>
              </Field>
              <Field label="Méthode de coût (art. 619-15 PCG)" hint="Coût moyen pondéré recommandé">
                <Select name="costMethod" defaultValue="CUMP"><option value="CUMP">Coût moyen pondéré (CUMP)</option><option value="FIFO">Premier entré, premier sorti (PEPS)</option></Select>
              </Field>
            </div>
          ) : (
            <input type="hidden" name="costMethod" value="CUMP" />
          )}
          <Field label="Première année à traiter" hint="Importez tout l'historique pour un coût d'acquisition exact : les années antérieures alimentent le calcul sans être exportées">
            <Select name="firstYear" defaultValue={String(thisYear - 1)}>{Array.from({ length: thisYear - 2016 }, (_, i) => 2017 + i).map((y) => <option key={y} value={y}>{y}</option>)}</Select>
          </Field>
          {state?.error && !state.fieldErrors ? <p className="text-sm text-negative">{state.error}</p> : null}
          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4" /> Retour</Button>
            <Button type="submit" loading={pending}>Créer le dossier</Button>
          </div>
        </form>
      )}
    </div>
  );
}
