"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { saveCoingeckoAction, saveGoogleAction } from "../actions";

/** The redirect URI, with a copy button: it has to be pasted exactly. */
function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <code className="num min-w-0 flex-1 truncate text-xs">{value}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            toast.error("Copie refusée par le navigateur — sélectionnez le texte à la main.");
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? "Copié" : "Copier"}
      </Button>
    </div>
  );
}

export function SetupForms({
  redirectUri,
  google,
  coingecko,
}: {
  redirectUri: string;
  origin: string;
  google: { configured: boolean; source: "ENV" | "CONSOLE" | "NONE"; clientId: string | null; secretHint: string | null };
  coingecko: { configured: boolean; hint: string | null };
}) {
  const [pending, start] = useTransition();
  const fromEnv = google.source === "ENV";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-violet" aria-hidden /> Connexion Google</CardTitle>
            <Badge tone={google.configured ? "positive" : "warning"}>
              {google.source === "ENV" ? "Environnement" : google.source === "CONSOLE" ? "Console" : "À configurer"}
            </Badge>
          </div>
          <CardDescription>
            {fromEnv
              ? "Les identifiants viennent de l'environnement : ils l'emportent sur ce formulaire."
              : "Collez le client OAuth. La connexion Google fonctionne à la requête suivante, sans redéploiement."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">URI de redirection autorisée</p>
            <CopyLine value={redirectUri} />
          </div>
          <form
            className="grid gap-3"
            action={(fd) =>
              start(async () => {
                const res = await saveGoogleAction(fd);
                if (res.ok) toast.success(res.message ?? "Enregistré.");
                else toast.error(res.error);
              })
            }
          >
            <Field label="Identifiant client">
              <Input name="clientId" defaultValue={google.clientId ?? ""} placeholder="1234567890-abc.apps.googleusercontent.com" disabled={fromEnv} />
            </Field>
            <Field label={google.secretHint ? `Secret client (enregistré : ${google.secretHint})` : "Secret client"}>
              <Input name="clientSecret" type="password" placeholder={google.secretHint ? "inchangé si laissé vide" : "GOCSPX-…"} disabled={fromEnv} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={pending} disabled={fromEnv}>Enregistrer</Button>
              {google.source === "CONSOLE" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const fd = new FormData();
                      fd.set("clear", "1");
                      const res = await saveGoogleAction(fd);
                      if (res.ok) toast.success("Client Google retiré.");
                      else toast.error(res.error);
                    })
                  }
                >
                  Retirer
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><LineChart className="h-4 w-4 text-brand-mint" aria-hidden /> Cours de secours</CardTitle>
            <Badge tone={coingecko.configured ? "positive" : "neutral"}>{coingecko.configured ? `Clé ${coingecko.hint}` : "Sans clé"}</Badge>
          </div>
          <CardDescription>
            Les cours viennent d&apos;abord des klines Binance et des taux BCE. CoinGecko sert de secours ; une clé de démonstration évite ses limites de débit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            action={(fd) =>
              start(async () => {
                const res = await saveCoingeckoAction(fd);
                if (res.ok) toast.success(res.message ?? "Enregistré.");
                else toast.error(res.error);
              })
            }
          >
            <Field label="Clé API CoinGecko (facultative)">
              <Input name="apiKey" type="password" placeholder={coingecko.configured ? "inchangée si laissée vide" : "CG-…"} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" loading={pending}>Enregistrer</Button>
              {coingecko.configured ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const fd = new FormData();
                      fd.set("clear", "1");
                      const res = await saveCoingeckoAction(fd);
                      if (res.ok) toast.success("Clé retirée.");
                      else toast.error(res.error);
                    })
                  }
                >
                  Retirer
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
