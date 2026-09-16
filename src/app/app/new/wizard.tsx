"use client";
import { useActionState, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createEntityAction, type ActionState } from "../actions";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function OnboardingWizard({ first, userName }: { first: boolean; userName: string | null }) {
  const [kind, setKind] = useState<"COMPANY" | "INDIVIDUAL" | null>(null);
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState<ActionState, FormData>(createEntityAction, undefined);
  const thisYear = new Date().getUTCFullYear();

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] md:p-8">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">{first ? `Bienvenue${userName ? `, ${userName.split(" ")[0]}` : ""}` : "Nouveau dossier"}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{step === 0 ? "Pour qui tenons-nous ces comptes ?" : kind === "COMPANY" ? "Votre société" : "Votre dossier personnel"}</h1>
      <p className="mt-1 text-sm text-fg-muted">{step === 0 ? "Le régime choisi détermine les calculs : PCG et FEC pour une entreprise, article 150 VH bis pour un particulier." : "Ces informations figurent dans les fichiers produits. Vous pourrez les modifier plus tard."}</p>

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
      ) : (
        <form action={action} className="mt-6 grid gap-4">
          <input type="hidden" name="kind" value={kind ?? "COMPANY"} />
          <Field label={kind === "COMPANY" ? "Dénomination sociale" : "Nom du dossier"} error={state?.fieldErrors?.name}>
            <Input name="name" required placeholder={kind === "COMPANY" ? "Ma Société SAS" : "Prénom Nom"} autoFocus />
          </Field>
          {kind === "COMPANY" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SIREN" hint="9 chiffres, utilisé pour nommer le FEC" error={state?.fieldErrors?.siren}><Input name="siren" inputMode="numeric" placeholder="123456789" /></Field>
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
            <Button type="button" variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="h-4 w-4" /> Retour</Button>
            <Button type="submit" loading={pending}>Créer le dossier</Button>
          </div>
        </form>
      )}
    </div>
  );
}
