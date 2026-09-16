import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { devLoginEnabled } from "@/auth.config";
import { platformNeedsBootstrap } from "@/lib/dal/platform";
import { googleCredentials } from "@/lib/dal/settings";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "Un compte existe déjà avec cet e-mail via un autre mode de connexion.",
  AccessDenied: "Accès refusé par le fournisseur d'identité.",
  Configuration: "La connexion Google n'est pas configurée (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
  CredentialsSignin: "Cette adresse ne correspond à aucun compte ouvert, ou le compte est désactivé.",
  Default: "La connexion a échoué. Réessayez.",
};

/**
 * Why an admission was refused.
 *
 * There is no sign-up form: an address nobody created is refused even with a
 * valid Google account. Saying so plainly is kinder than a generic failure, and
 * it tells the person who to ask.
 */
const DENIED: Record<string, { title: string; body: string }> = {
  unknown: {
    title: "Aucun compte n'est ouvert pour cette adresse",
    body: "L'accès est accordé compte par compte : il n'y a pas d'inscription libre. Demandez à l'administrateur de la plateforme d'ouvrir un compte à cette adresse, exactement celle de votre compte Google.",
  },
  invited: {
    title: "Ce compte n'est pas encore activé",
    body: "Le compte existe mais n'a pas été activé. L'administrateur doit l'activer et ouvrir au moins un pays avant votre première connexion.",
  },
  suspended: {
    title: "Ce compte est désactivé",
    body: "Vos données sont conservées, l'accès est suspendu. Contactez l'administrateur de la plateforme pour connaître le motif et demander la réactivation.",
  },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string; denied?: string; bootstrap?: string }> }) {
  const session = await auth();
  const { callbackUrl, error, denied, bootstrap } = await searchParams;
  const refusal = denied ? DENIED[denied] ?? DENIED.unknown : null;
  const target = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/app";
  if (session?.user) redirect(target);
  const [google, needsBootstrap] = await Promise.all([googleCredentials(), platformNeedsBootstrap()]);
  const googleConfigured = google.source !== "NONE";

  return (
    <div className="brand-aura relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="rise relative w-full max-w-md">
        <div className="mb-7 flex justify-center"><Link href="/"><Logo size={32} className="text-[22px]" /></Link></div>
        <div className="relative overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)]">
          <div className="absolute inset-x-0 top-0 h-1 brand-rule" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">{needsBootstrap ? "Première connexion" : "Connexion"}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {needsBootstrap
              ? "Cette installation n'a pas encore d'administrateur. Le code de démarrage vous donne la main : vous ouvrirez ensuite les comptes et les pays depuis la console."
              : "Un compte Google suffit. Vous créerez ensuite votre premier dossier (société ou particulier)."}
          </p>
          {needsBootstrap ? (
            <form
              className="mt-5 rounded-xl border border-border bg-surface-2 p-4"
              action={async (formData: FormData) => {
                "use server";
                try {
                  await signIn("bootstrap", {
                    email: String(formData.get("email") ?? ""),
                    name: String(formData.get("name") ?? ""),
                    code: String(formData.get("code") ?? ""),
                    redirectTo: "/admin/setup",
                  });
                } catch (e) {
                  // A successful sign-in throws a redirect, which must pass
                  // through; only a refusal is ours to report.
                  if (e instanceof AuthError) redirect("/login?bootstrap=failed");
                  throw e;
                }
              }}
            >
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-violet"><KeyRound className="h-3.5 w-3.5" aria-hidden /> Code de démarrage</p>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                Render → votre service <span className="num">finly</span> → <span className="font-medium">Environment</span> → <span className="num">ADMIN_BOOTSTRAP_CODE</span>. Le code cesse de fonctionner dès qu&apos;un administrateur existe.
              </p>
              {bootstrap === "failed" ? (
                <p className="mt-3 flex gap-2 rounded-lg bg-negative-soft p-2.5 text-xs text-negative"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Code refusé, ou un administrateur existe déjà.</p>
              ) : null}
              <div className="mt-3 grid gap-3">
                <Field label="Votre e-mail"><Input name="email" type="email" required placeholder="vous@cabinet.fr" /></Field>
                <Field label="Votre nom"><Input name="name" placeholder="Prénom Nom" /></Field>
                <Field label="Code de démarrage"><Input name="code" type="password" required placeholder="collé depuis Render" /></Field>
                <Button type="submit"><ShieldCheck className="h-4 w-4" aria-hidden /> Devenir administrateur</Button>
              </div>
            </form>
          ) : null}
          {refusal ? (
            <div className="mt-4 rounded-lg bg-warning-soft p-3 text-sm">
              <p className="flex gap-2 font-medium text-fg"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />{refusal.title}</p>
              <p className="mt-1 pl-6 text-fg-muted">{refusal.body}</p>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 flex gap-2 rounded-lg bg-negative-soft p-3 text-sm text-negative"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{ERRORS[error] ?? ERRORS.Default}</div>
          ) : null}
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: target });
            }}
          >
            <Button type="submit" size="lg" className="w-full" disabled={!googleConfigured}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.7 4.4-5.35 4.4-3.2 0-5.8-2.65-5.8-5.9s2.6-5.9 5.8-5.9c1.85 0 3.05.8 3.75 1.45l2.55-2.45C16.7 4.1 14.55 3 12 3 7.05 3 3 7.05 3 12s4.05 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.6-.05-1.05-.3-1.1Z" /></svg>
              Continuer avec Google
            </Button>
            {!googleConfigured ? (
              <p className="mt-2 text-center text-xs text-fg-subtle">
                Connexion Google pas encore configurée. Un administrateur la renseigne depuis <span className="font-medium">Administration → Installation</span>, sans redéploiement.
              </p>
            ) : null}
          </form>
          {devLoginEnabled ? (
            <form
              className="mt-6 border-t border-border pt-5"
              action={async (formData: FormData) => {
                "use server";
                await signIn("dev-login", { email: String(formData.get("email") ?? ""), name: String(formData.get("name") ?? ""), redirectTo: target });
              }}
            >
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-warning">Mode démonstration (AUTH_DEV_LOGIN)</p>
              <div className="grid gap-3">
                <Field label="E-mail"><Input name="email" type="email" required placeholder="vous@exemple.fr" defaultValue="demo@finly.local" /></Field>
                <Field label="Nom"><Input name="name" placeholder="Prénom Nom" defaultValue="Compte démo" /></Field>
                <Button type="submit" variant="outline">Entrer sans Google</Button>
              </div>
            </form>
          ) : null}
        </div>
        <p className="mt-4 text-center text-xs text-fg-subtle">En vous connectant vous acceptez que vos données de transactions soient traitées pour produire vos documents comptables. Aucune revente, aucune publicité.</p>
      </div>
    </div>
  );
}
