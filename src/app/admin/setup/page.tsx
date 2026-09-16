import { CheckCircle2, CircleAlert, CircleDashed, ExternalLink } from "lucide-react";
import { requireSignedIn } from "@/auth";
import { requireAdmin } from "@/lib/dal/platform";
import { setupReport, type CheckState } from "@/lib/services/setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SetupForms } from "./client";

export const metadata = { title: "Installation" };

const ICON: Record<CheckState, typeof CheckCircle2> = { OK: CheckCircle2, WARN: CircleAlert, TODO: CircleDashed };
const TONE: Record<CheckState, string> = { OK: "text-positive", WARN: "text-warning", TODO: "text-fg-subtle" };

/**
 * What the deployment still needs, and the two fields that fix most of it.
 *
 * The blueprint asks for nothing at creation time, so this page is where the
 * service says what is missing — and lets an administrator finish the job
 * without going back to the hosting dashboard.
 */
export default async function SetupPage() {
  const { id } = await requireSignedIn();
  await requireAdmin(id);
  const report = await setupReport();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Installation</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Ce service répond sur <span className="num">{report.origin}</span>.{" "}
          {report.ready ? "Tout ce qui est nécessaire est en place." : "Il reste quelque chose à faire, ci-dessous."}
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>État</CardTitle>
            <Badge tone={report.ready ? "positive" : "warning"}>{report.ready ? "Prêt" : "À compléter"}</Badge>
          </div>
          <CardDescription>Chaque ligne dit ce qui est en place, et sinon quoi faire.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {report.checks.map((c) => {
              const Icon = ICON[c.state];
              return (
                <li key={c.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[c.state]}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="mt-0.5 text-sm text-fg-muted">{c.detail}</p>
                    {c.action ? <p className="mt-1 text-sm text-fg">{c.action}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <SetupForms
        redirectUri={report.googleRedirectUri}
        origin={report.origin}
        google={report.google}
        coingecko={report.coingecko}
      />

      <Card>
        <CardHeader>
          <CardTitle>Créer le client OAuth chez Google</CardTitle>
          <CardDescription>Cinq minutes, une seule fois. L&apos;URI de redirection est celle affichée ci-dessus.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-fg-muted">
            <li>
              <span className="font-medium text-fg">1.</span> Ouvrez{" "}
              <a className="inline-flex items-center gap-1 text-primary hover:underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                console.cloud.google.com → Identifiants <ExternalLink className="h-3 w-3" aria-hidden />
              </a>{" "}
              et créez un projet si vous n&apos;en avez pas.
            </li>
            <li><span className="font-medium text-fg">2.</span> <em>Créer des identifiants</em> → <em>ID client OAuth</em> → type <em>Application Web</em>.</li>
            <li><span className="font-medium text-fg">3.</span> Dans <em>URI de redirection autorisés</em>, collez l&apos;URI affichée ci-dessus. Rien d&apos;autre.</li>
            <li><span className="font-medium text-fg">4.</span> Copiez l&apos;identifiant client et le secret, collez-les ci-dessus, enregistrez.</li>
            <li><span className="font-medium text-fg">5.</span> Sur l&apos;écran de consentement, ajoutez les adresses de test tant que l&apos;application n&apos;est pas publiée.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
