import { requireSignedIn } from "@/auth";
import { listAccounts } from "@/lib/services/admin";
import { countryChoices } from "@/lib/countries/registry";
import { PageHeader } from "@/components/ui/misc";
import { AccountsClient } from "./client";

export const metadata = { title: "Comptes — administration" };

export default async function AccountsPage() {
  const { id } = await requireSignedIn();
  const [accounts, countries] = await Promise.all([
    listAccounts(id),
    Promise.resolve(countryChoices().map((c) => ({ code: c.code, name: c.name.fr, flag: c.flag }))),
  ]);
  return (
    <>
      <PageHeader
        title="Comptes"
        description="Tous les comptes de la plateforme. Ils sont créés ici et nulle part ailleurs : personne ne peut s'inscrire seul."
      />
      <AccountsClient
        currentAdminId={id}
        countries={countries}
        accounts={accounts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), activatedAt: a.activatedAt?.toISOString() ?? null, lastSeenAt: a.lastSeenAt?.toISOString() ?? null }))}
      />
    </>
  );
}
