import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, LayoutDashboard, ScrollText, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { requireSignedIn } from "@/auth";
import { requireAdmin } from "@/lib/dal/platform";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav } from "./nav";

export const metadata = { title: "Console d'administration" };

/**
 * The console is guarded here, on the signed-in account rather than the
 * effective one: an administrator who is viewing as a client is, for the
 * duration, that client — and must not be able to administer the platform from
 * inside someone else's session.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { id } = await requireSignedIn();
  let admin;
  try {
    admin = await requireAdmin(id);
  } catch {
    notFound();
  }

  const nav = [
    { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard },
    { href: "/admin/accounts", label: "Comptes", icon: Users },
    { href: "/admin/activity", label: "Activité", icon: Activity },
    { href: "/admin/audit", label: "Journal d'audit", icon: ScrollText },
    { href: "/admin/setup", label: "Installation", icon: SlidersHorizontal },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link href="/admin" className="flex items-center gap-2"><Logo /></Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Administration
          </span>
          <AdminNav items={nav.map((n) => ({ href: n.href, label: n.label }))} />
          <div className="ml-auto flex items-center gap-3">
            <Link href="/app" className="text-sm text-fg-muted hover:text-fg">Retour à l&apos;application</Link>
            <span className="hidden text-sm text-fg-subtle sm:inline">{admin.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
