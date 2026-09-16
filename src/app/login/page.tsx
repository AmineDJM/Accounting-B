import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { auth, signIn } from "@/auth";
import { devLoginEnabled } from "@/auth.config";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "Un compte existe déjà avec cet e-mail via un autre mode de connexion.",
  AccessDenied: "Accès refusé par le fournisseur d'identité.",
  Configuration: "La connexion Google n'est pas configurée (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
  CredentialsSignin: "Adresse e-mail invalide.",
  Default: "La connexion a échoué. Réessayez.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;
  const target = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/app";
  if (session?.user) redirect(target);
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID);

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Link href="/"><Logo /></Link></div>
        <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)]">
          <h1 className="text-xl font-semibold tracking-tight">Connexion</h1>
          <p className="mt-1 text-sm text-fg-muted">Un compte Google suffit. Vous créerez ensuite votre premier dossier (société ou particulier).</p>
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
            {!googleConfigured ? <p className="mt-2 text-center text-xs text-fg-subtle">Google OAuth non configuré sur ce serveur.</p> : null}
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
                <Field label="E-mail"><Input name="email" type="email" required placeholder="vous@exemple.fr" defaultValue="demo@chainbook.local" /></Field>
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
