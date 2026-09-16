import Link from "next/link";
import { ArrowRight, BookCheck, Building2, FileSpreadsheet, Landmark, Lock, ShieldCheck, Sparkles, UserRound, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  const cta = session?.user ? { href: "/app", label: "Ouvrir mon espace" } : { href: "/login", label: "Continuer avec Google" };
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-fg-muted md:flex">
            <a href="#fonctionnalites" className="hover:text-fg">Fonctionnalités</a>
            <a href="#regimes" className="hover:text-fg">Entreprise & particulier</a>
            <a href="#securite" className="hover:text-fg">Sécurité</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href={cta.href}><Button size="sm">{cta.label}</Button></Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="grid-bg relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 text-center md:pt-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> PCG 2025 · art. 619-12 à 619-15 · FEC art. A47 A-1 · art. 150 VH bis CGI
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
              La comptabilité crypto qui parle <span className="text-primary">FEC</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-fg-muted">
              Connectez vos comptes d&apos;échange, valorisez chaque opération en euros au cours du moment, et obtenez un journal comptable équilibré, un FEC validé et vos plus-values — pour votre entreprise comme pour votre déclaration personnelle.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={cta.href}><Button size="lg">{cta.label} <ArrowRight className="h-4 w-4" /></Button></Link>
              <a href="#fonctionnalites"><Button size="lg" variant="outline">Voir comment ça marche</Button></a>
            </div>
            <p className="mt-4 text-xs text-fg-subtle">Clés API en lecture seule · export CSV accepté · multi-dossiers · accès expert-comptable</p>
          </div>
        </section>

        <section id="fonctionnalites" className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: Wallet, title: "Import complet", text: "API Binance (trades spot, convert, achats carte, dépôts/retraits, earn, poussières) ou export CSV. Détection des transferts entre vos propres wallets." },
              { icon: Landmark, title: "Valorisation en euros", text: "Cours 15 minutes Binance avec pont USDT, taux de change officiels BCE/Banque de France pour les devises, cache et traçabilité de la source de chaque cours." },
              { icon: BookCheck, title: "Journal PCG & FEC", text: "Comptes 522 jetons détenus, 7674/6674, écritures d'inventaire 4742/4752 avec provision, contre-passation, numérotation continue et validateur FEC intégré." },
              { icon: FileSpreadsheet, title: "Plus-values 150 VH bis", text: "Formule du prix total d'acquisition, fractions de capital initial, seuil de 305 €, export des lignes du formulaire 2086 et liste des comptes pour le 3916-bis." },
              { icon: Building2, title: "Multi-dossiers", text: "Plusieurs sociétés ou personnes par utilisateur, plusieurs comptes d'échange par dossier, rôles propriétaire / admin / comptable / lecture et invitations." },
              { icon: ShieldCheck, title: "Fait pour l'expert-comptable", text: "Chaque écriture est justifiée (référence d'ordre, hash de transaction, cours utilisé). Compte d'attente 471 pour ce qui reste à qualifier, jamais d'opération perdue." },
            ].map((f) => (
              <div key={f.title} className="rounded-[var(--radius)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
                <div className="mb-3 inline-flex rounded-lg bg-primary-soft p-2 text-primary"><f.icon className="h-5 w-5" /></div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="regimes" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-border bg-bg p-6">
              <div className="flex items-center gap-2 text-primary"><Building2 className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wide">Entreprise (IS / BIC)</span></div>
              <h3 className="mt-3 text-xl font-semibold">Journal, balance, FEC, inventaire</h3>
              <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                <li>• Coût moyen pondéré ou PEPS (art. 619-15 PCG)</li>
                <li>• Chaque échange crypto ↔ crypto constate une plus ou moins-value</li>
                <li>• Écritures de clôture : différences d&apos;évaluation et provision pour perte latente</li>
                <li>• Fichier SIREN + FEC + AAAAMMJJ, séparateur « | », validé avant téléchargement</li>
              </ul>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-bg p-6">
              <div className="flex items-center gap-2 text-primary"><UserRound className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wide">Particulier (art. 150 VH bis)</span></div>
              <h3 className="mt-3 text-xl font-semibold">Déclaration 2086 sans tableur</h3>
              <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                <li>• Seules les cessions contre euros ou biens sont imposables, les échanges crypto ↔ crypto restent en sursis</li>
                <li>• Valeur globale du portefeuille et prix total d&apos;acquisition recalculés à chaque cession</li>
                <li>• Exonération sous 305 € de cessions annuelles, PFU 30 % ou option barème</li>
                <li>• Liste des comptes ouverts à l&apos;étranger pour le formulaire 3916-bis</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="securite" className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Vos clés ne peuvent rien faire d&apos;autre que lire</h2>
              <p className="mt-3 text-fg-muted">Nous demandons des clés API en lecture seule, restreintes à notre adresse IP, chiffrées AES-256-GCM avant stockage. Vous pouvez aussi ne jamais nous confier de clé et travailler uniquement à partir des exports CSV de la plateforme.</p>
              <ul className="mt-4 space-y-2 text-sm text-fg-muted">
                <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 text-primary" /> Connexion Google (OAuth 2.0), pas de mot de passe à retenir.</li>
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /> Journal d&apos;audit de chaque import, requalification et export.</li>
                <li className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 text-primary" /> Hébergement en Union européenne, données isolées par dossier.</li>
              </ul>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-surface p-5 text-sm shadow-[var(--shadow)]">
              <p className="font-medium">Chainbook est un logiciel, pas un cabinet.</p>
              <p className="mt-2 text-fg-muted">Il prépare vos écritures et vos calculs ; la tenue et la révision des comptes d&apos;un tiers restent réservées aux experts-comptables inscrits à l&apos;Ordre. Invitez le vôtre sur votre dossier : il y a un rôle pour lui.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-fg-subtle">
        <p>© {new Date().getFullYear()} Chainbook · Les calculs fournis ne constituent pas un conseil fiscal ou comptable personnalisé.</p>
      </footer>
    </div>
  );
}
