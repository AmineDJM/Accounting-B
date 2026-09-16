import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSignedIn } from "@/auth";
import { accountFiles, listAccounts, orphanedCountries } from "@/lib/services/admin";
import { countryChoices } from "@/lib/countries/registry";
import { PageHeader } from "@/components/ui/misc";
import { AccountDetailClient } from "./client";

export const metadata = { title: "Compte — administration" };

export default async function AccountDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { id } = await requireSignedIn();
  const accounts = await listAccounts(id);
  const account = accounts.find((a) => a.id === userId);
  if (!account) notFound();
  const [files, orphaned] = await Promise.all([accountFiles(id, userId), orphanedCountries(id, userId)]);

  return (
    <>
      <Link href="/admin/accounts" className="mb-2 inline-block text-sm text-fg-muted hover:text-fg">← Tous les comptes</Link>
      <PageHeader
        title={account.email ?? "Compte"}
        description={[account.name, account.company].filter(Boolean).join(" · ") || undefined}
      />
      <AccountDetailClient
        isSelf={account.id === id}
        account={{
          ...account,
          createdAt: account.createdAt.toISOString(),
          activatedAt: account.activatedAt?.toISOString() ?? null,
          lastSeenAt: account.lastSeenAt?.toISOString() ?? null,
        }}
        countries={countryChoices().map((c) => ({ code: c.code, name: c.name.fr, flag: c.flag, summary: c.summary.fr, reviewed: c.reviewed }))}
        orphaned={orphaned}
        files={files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
      />
    </>
  );
}
