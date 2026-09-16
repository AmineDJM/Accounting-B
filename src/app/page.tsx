import Link from "next/link";
import { ArrowRight, BookCheck, Building2, FileCheck2, Globe2, Layers, Lock, ScanLine, ShieldCheck, Sparkles, UsersRound, Workflow } from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { countryChoices } from "@/lib/countries/registry";
import { auth } from "@/auth";

const STEPS = [
  { n: "01", title: "Importer", text: "API en lecture seule ou export CSV : Binance, Coinbase, Kraken, Bitvavo, Bitpanda, Crypto.com, Bitstamp, Ledger. Le format est reconnu tout seul.", accent: "var(--brand-blue)" },
  { n: "02", title: "Qualifier", text: "Transferts entre vos propres portefeuilles rapprochés, frais rattachés, ce qui reste douteux part en compte d'attente — jamais dans un résultat.", accent: "var(--brand-violet)" },
  { n: "03", title: "Produire", text: "Journal au plan de comptes du pays, fichier d'audit local, impôt personnel et cases du formulaire, relevé DAC8 rapproché.", accent: "var(--brand-coral)" },
  { n: "04", title: "Expliquer", text: "Chaque montant se déplie jusqu'à l'opération et à l'article dont il découle. Le détail est conservé avec le calcul, pas recalculé.", accent: "var(--brand-amber)" },
];

const FEATURES = [
  { icon: Layers, tint: "var(--brand-blue)", title: "Huit plateformes, un modèle", text: "Trades, convert, achats carte, dépôts et retraits, earn, poussières. Tout devient la même opération : des jambes entrantes, sortantes et des frais." },
  { icon: Globe2, tint: "var(--brand-violet)", title: "Douze juridictions", text: "Les règles d'un pays sont un fichier de données, pas un moteur. Trois calculateurs les lisent : gains lot par lot, assiette portefeuille française, patrimoine à une date." },
  { icon: BookCheck, tint: "var(--brand-mint)", title: "Le plan de comptes du pays", text: "PCG, SKR 04, EKR, PGC, SNC, PCMN, RGS, KMU, IFRS. Écritures équilibrées, numérotation continue, inventaire et contre-passation." },
  { icon: FileCheck2, tint: "var(--brand-amber)", title: "Le fichier que l'administration attend", text: "FEC, lot DATEV EXTF, SAF-T (PT) 1.04_01, XAF 3.2, journal générique. Relus et validés avant téléchargement, encodage compris." },
  { icon: ScanLine, tint: "var(--brand-coral)", title: "Rapprochement DAC8", text: "Le relevé du prestataire face à vos propres agrégats, élément par élément, avec les deux lectures des frais que la directive et le schéma XML autorisent." },
  { icon: Workflow, tint: "var(--brand-blue)", title: "Explicabilité", text: "Formule, entrées, sortie, référence légale. Un contrôle se répond avec l'écran, pas avec un tableur reconstitué six mois plus tard." },
];

export default async function LandingPage() {
  const session = await auth();
  const cta = session?.user ? { href: "/app", label: "Ouvrir mon espace" } : { href: "/login", label: "Se connecter" };
  const countries = countryChoices();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-fg-muted md:flex">
            <a href="#flux" className="transition-colors hover:text-fg">Le flux</a>
            <a href="#pays" className="transition-colors hover:text-fg">Pays</a>
            <a href="#cabinets" className="transition-colors hover:text-fg">Cabinets</a>
            <a href="#securite" className="transition-colors hover:text-fg">Sécurité</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href={cta.href}><Button size="sm" className="rounded-full px-4">{cta.label}</Button></Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="brand-aura relative overflow-hidden">
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 md:pt-28">
            <div className="rise text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-fg-muted shadow-[var(--shadow)] backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-brand-violet" aria-hidden />
                DAC8 · CARF · douze juridictions · explicabilité intégrale
              </span>
              <h1 className="display mx-auto mt-7 max-w-4xl text-[2.6rem] font-semibold md:text-[4.25rem]">
                La comptabilité crypto,<br className="hidden sm:block" /> <span className="brand-text">pays par pays</span>.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
                Finly transforme l&apos;historique d&apos;un compte d&apos;échange en écritures, en fichier d&apos;audit et en impôt calculé sous les règles du pays qui gouverne le dossier — et montre, pour chaque montant, d&apos;où il vient.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href={cta.href}><Button size="lg" className="rounded-full px-7">{cta.label} <ArrowRight className="h-4 w-4" /></Button></Link>
                <a href="#flux"><Button size="lg" variant="outline" className="rounded-full px-7">Voir le flux</Button></a>
              </div>
              <p className="mt-5 text-xs text-fg-subtle">Clés API en lecture seule · accès ouvert compte par compte · hébergement en Union européenne</p>
            </div>

            {/* What the product actually looks like: a figure and its proof. */}
            <div className="rise mx-auto mt-14 max-w-3xl" style={{ animationDelay: "120ms" }}>
              <div className="overflow-hidden rounded-[calc(var(--radius)+6px)] border border-border bg-surface shadow-[var(--shadow-lg)]">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <LogoMark size={18} />
                  <span className="text-xs font-medium text-fg-muted">Dossier Nova Digital · France · exercice 2025</span>
                  <span className="ml-auto rounded-full bg-brand-amber-soft px-2 py-0.5 text-[11px] font-medium text-warning">Règles non relues</span>
                </div>
                <div className="grid gap-0 sm:grid-cols-[1fr_1.25fr]">
                  <div className="border-border p-5 sm:border-r">
                    <p className="text-xs uppercase tracking-wide text-fg-subtle">Plus-value imposable</p>
                    <p className="num mt-2 text-3xl font-semibold">4 812,50 €</p>
                    <p className="mt-1 text-xs text-fg-muted">Art. 150 VH bis CGI · PFU 30 %</p>
                    <div className="mt-4 h-px w-full brand-rule opacity-70" />
                    <dl className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between gap-3"><dt className="text-fg-muted">Prix de cession</dt><dd className="num">18 400,00 €</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-fg-muted">Prix total d&apos;acquisition</dt><dd className="num">31 250,00 €</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-fg-muted">Valeur du portefeuille</dt><dd className="num">42 900,00 €</dd></div>
                    </dl>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium text-fg-muted">Comment ce montant est obtenu</p>
                    <ol className="mt-3 space-y-3 text-xs">
                      {[
                        { c: "var(--brand-blue)", t: "Cession du 14/03/2025", f: "18 400,00 € encaissés, frais 24,60 € déduits" },
                        { c: "var(--brand-violet)", t: "Fraction de capital initial", f: "31 250,00 × (18 400,00 ÷ 42 900,00)" },
                        { c: "var(--brand-coral)", t: "Plus-value", f: "18 400,00 − 13 587,50 = 4 812,50" },
                      ].map((s) => (
                        <li key={s.t} className="relative pl-5">
                          <span className="absolute left-0 top-[5px] h-2.5 w-2.5 rounded-full" style={{ background: s.c }} aria-hidden />
                          <p className="font-medium">{s.t}</p>
                          <p className="num mt-0.5 text-fg-muted">{s.f}</p>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-fg-muted">
                      Chaque étape conserve ses entrées, sa formule et son article. Rien n&apos;est recalculé à l&apos;affichage.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The flow */}
        <section id="flux" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-3xl font-semibold md:text-4xl">Quatre gestes, du relevé à la déclaration</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-fg-muted">Le même chemin pour un particulier belge et pour une société allemande. Ce qui change est le pack de règles, pas la méthode.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="lift relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: s.accent }} aria-hidden />
                <span className="num text-xs font-semibold" style={{ color: s.accent }}>{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="grid gap-5 md:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="lift rounded-[var(--radius)] border border-border bg-bg p-6 shadow-[var(--shadow)]">
                  <div className="mb-4 inline-flex rounded-xl p-2.5" style={{ background: `color-mix(in oklab, ${f.tint} 12%, transparent)`, color: f.tint }}>
                    <f.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Countries, read from the packs themselves */}
        <section id="pays" className="mx-auto max-w-6xl px-4 py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="text-3xl font-semibold md:text-4xl">Douze pays, écrits à partir des textes</h2>
              <p className="mt-3 max-w-2xl text-fg-muted">Chaque pack cite les articles dont il découle et liste ses hypothèses. Tous portent le statut <em>non relu par un professionnel local</em>, et l&apos;application l&apos;affiche sur chaque calcul plutôt que de le taire.</p>
            </div>
            <Link href={cta.href} className="shrink-0"><Button variant="outline" className="rounded-full px-5">Ouvrir un dossier <ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {countries.map((c) => (
              <div key={c.code} className="lift flex gap-3 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-[var(--shadow)]">
                <span className="text-2xl leading-none" aria-hidden>{c.flag}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {c.name.fr}
                    {c.dac8 ? <span className="rounded-full bg-brand-blue-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-info">DAC8</span> : null}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{c.summary.fr}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* For practices */}
        <section id="cabinets" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[1.1fr_1fr] md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-violet"><UsersRound className="h-4 w-4" aria-hidden /> Pensé pour les cabinets</span>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Un portefeuille de dossiers, pas un fichier par client</h2>
              <p className="mt-4 leading-relaxed text-fg-muted">
                Le cockpit donne l&apos;état de chaque dossier : ce qui reste à qualifier, l&apos;exercice en cours, l&apos;échéance, la dernière génération. Les rôles suivent l&apos;organisation d&apos;un cabinet — propriétaire, administrateur, comptable, lecture — et le client garde la main sur ses propres connexions.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Accès ouvert compte par compte : il n'y a pas d'inscription libre.",
                  "Les pays sont donnés compte par compte, et vérifiés côté serveur.",
                  "Un administrateur peut consulter un dossier en lecture seule, motif obligatoire, consultation journalisée.",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-mint" aria-hidden /><span className="text-fg-muted">{t}</span></li>
                ))}
              </ul>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-bg p-6 shadow-[var(--shadow)]">
              <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-blue" aria-hidden /><span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Le dossier, quel que soit le pays</span></div>
              <div className="mt-5 space-y-4 text-sm">
                {[
                  { k: "Entreprise", v: "Journal, balance, inventaire, fichier d'audit local, provision pour perte latente." },
                  { k: "Particulier", v: "Impôt calculé sous le régime du pays, cases du formulaire local, seuils et exonérations." },
                  { k: "Prestataire", v: "Relevé DAC8 rapproché élément par élément, écarts expliqués et justifiés." },
                ].map((r) => (
                  <div key={r.k} className="border-b border-border pb-4 last:border-0 last:pb-0">
                    <p className="font-medium">{r.k}</p>
                    <p className="mt-1 text-fg-muted">{r.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="securite" className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <h2 className="text-3xl font-semibold md:text-4xl">Vos clés ne peuvent rien faire d&apos;autre que lire</h2>
              <p className="mt-4 leading-relaxed text-fg-muted">Nous demandons des clés API en lecture seule, testées avant enregistrement, chiffrées en AES-256-GCM. Le navigateur n&apos;en revoit jamais que les quatre derniers caractères. Vous pouvez aussi ne jamais nous confier de clé et travailler uniquement à partir des exports CSV.</p>
              <ul className="mt-6 space-y-3 text-sm text-fg-muted">
                <li className="flex gap-2.5"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden /> Connexion Google (OAuth 2.0), sans mot de passe à retenir.</li>
                <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-violet" aria-hidden /> Journal d&apos;audit de chaque import, requalification, export et consultation.</li>
                <li className="flex gap-2.5"><Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-mint" aria-hidden /> Hébergement en Union européenne, données isolées par dossier.</li>
              </ul>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
              <LogoMark size={24} />
              <p className="mt-3 font-medium">Finly est un logiciel, pas un cabinet.</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">Il prépare les écritures et les calculs ; la tenue et la révision des comptes d&apos;un tiers restent réservées aux professionnels inscrits. Invitez le vôtre sur le dossier : il y a un rôle pour lui.</p>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="mx-auto max-w-6xl px-4 pb-24">
          <div className="relative overflow-hidden rounded-[calc(var(--radius)+8px)] border border-border bg-surface px-6 py-14 text-center shadow-[var(--shadow-lg)]">
            <div className="absolute inset-x-0 top-0 h-1 brand-rule" aria-hidden />
            <h2 className="text-3xl font-semibold md:text-4xl">Commencez par un dossier</h2>
            <p className="mx-auto mt-3 max-w-xl text-fg-muted">Un import, un journal, un fichier d&apos;audit. Le reste suit la même méthode, dans les onze autres pays.</p>
            <div className="mt-8 flex justify-center">
              <Link href={cta.href}><Button size="lg" className="rounded-full px-8">{cta.label} <ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-xs text-fg-subtle">
          <Logo size={22} className="text-sm" />
          <p>© {new Date().getFullYear()} Finly · Les calculs fournis ne constituent pas un conseil fiscal ou comptable personnalisé.</p>
        </div>
      </footer>
    </div>
  );
}
