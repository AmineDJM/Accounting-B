import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-surface p-6 text-center shadow-[var(--shadow-lg)]">
        <Logo className="justify-center" />
        <h1 className="mt-4 text-xl font-semibold">Rejoindre un dossier</h1>
        <p className="mt-2 text-sm text-fg-muted">Vous avez été invité à collaborer sur un dossier Chainbook. L&apos;invitation est liée à votre adresse e-mail.</p>
        <form action={acceptInvitationAction.bind(null, token)} className="mt-6">
          <Button type="submit" size="lg" className="w-full">Accepter l&apos;invitation</Button>
        </form>
      </div>
    </div>
  );
}
