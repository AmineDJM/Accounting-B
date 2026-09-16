import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Dossier introuvable</h1>
      <p className="max-w-md text-sm text-fg-muted">Ce dossier n&apos;existe pas ou vous n&apos;y avez pas accès. Demandez une invitation à son propriétaire.</p>
      <Link href="/app"><Button>Retour à mes dossiers</Button></Link>
    </div>
  );
}
