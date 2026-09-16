import Link from "next/link";
import { requireUser } from "@/auth";
import { listEntitiesForUser } from "@/lib/dal/entities";
import { Logo } from "@/components/logo";
import { countryChoices } from "@/lib/countries/registry";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Nouveau dossier" };

export default async function NewEntityPage() {
  const user = await requireUser();
  const memberships = await listEntitiesForUser(user.id);
  const countries = countryChoices().map((c) => ({ code: c.code, name: c.name.fr, flag: c.flag, currency: c.currency, regime: c.regime, summary: c.summary.fr, reviewed: c.reviewed, dac8: c.dac8 }));
  return (
    <div className="grid-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href={memberships.length ? "/app" : "/"}><Logo /></Link>
          {memberships.length ? <Link href="/app" className="text-sm text-fg-muted hover:text-fg">← Retour à mes dossiers</Link> : null}
        </div>
        <OnboardingWizard first={memberships.length === 0} userName={user.name} countries={countries} />
      </div>
    </div>
  );
}
