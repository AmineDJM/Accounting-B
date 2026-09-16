"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, Building2, Check, ChevronsUpDown, Download, LayoutDashboard, ListOrdered, LogOut, Menu, Plus, Receipt, Settings, UserRound, Wallet, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { signOutAction, switchEntityAction } from "@/app/app/actions";

export interface ShellEntity { id: string; name: string; kind: "COMPANY" | "INDIVIDUAL"; role: string }
export interface ShellUser { name: string | null; email: string | null; image: string | null }

const ROLE_LABEL: Record<string, string> = { OWNER: "Propriétaire", ADMIN: "Admin", ACCOUNTANT: "Comptable", VIEWER: "Lecture" };

export function AppShell({ entity, entities, user, flagged, children }: { entity: ShellEntity; entities: ShellEntity[]; user: ShellUser; flagged: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/app/${entity.id}`;
  const nav = [
    { href: `${base}/dashboard`, label: "Tableau de bord", icon: LayoutDashboard },
    { href: `${base}/accounts`, label: "Comptes & imports", icon: Wallet },
    { href: `${base}/transactions`, label: "Transactions", icon: ListOrdered, badge: flagged },
    ...(entity.kind === "COMPANY" ? [{ href: `${base}/journal`, label: "Journal & FEC", icon: BookOpen }] : [{ href: `${base}/tax`, label: "Plus-values (2086)", icon: Receipt }]),
    { href: `${base}/exports`, label: "Exports", icon: Download },
    { href: `${base}/settings`, label: "Paramètres", icon: Settings },
  ];

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/app"><Logo /></Link>
        <button className="rounded-md p-1 text-fg-muted lg:hidden" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X className="h-5 w-5" /></button>
      </div>
      <div className="px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="entity-switcher" className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", entity.kind === "COMPANY" ? "bg-primary-soft text-primary" : "bg-info-soft text-info")}>{entity.kind === "COMPANY" ? <Building2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{entity.name}</span>
                <span className="block text-[11px] text-fg-subtle">{entity.kind === "COMPANY" ? "Entreprise" : "Particulier"} · {ROLE_LABEL[entity.role] ?? entity.role}</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-fg-subtle" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72" align="start">
            <DropdownMenuLabel>Mes dossiers</DropdownMenuLabel>
            {entities.map((e) => (
              <DropdownMenuItem key={e.id} data-testid="entity-option" onSelect={() => switchEntityAction(e.id)}>
                {e.kind === "COMPANY" ? <Building2 className="h-4 w-4 text-fg-subtle" /> : <UserRound className="h-4 w-4 text-fg-subtle" />}
                <span className="flex-1 truncate">{e.name}</span>
                {e.id === entity.id ? <Check className="h-4 w-4 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/app/new"><Plus className="h-4 w-4" /> Nouveau dossier</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 px-3">
        {nav.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-primary-soft text-primary" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {n.badge ? <Badge tone="warning">{n.badge}</Badge> : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {user.image ? <img src={user.image} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">{(user.name ?? user.email ?? "?").slice(0, 2).toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name ?? "Utilisateur"}</span><span className="block truncate text-[11px] text-fg-subtle">{user.email}</span></span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => signOutAction()}><LogOut className="h-4 w-4" /> Se déconnecter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">{Sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-[var(--shadow-lg)]">{Sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></Button>
          <p className="truncate text-sm text-fg-muted lg:hidden">{entity.name}</p>
          <div className="ml-auto flex items-center gap-1"><ThemeToggle /></div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
