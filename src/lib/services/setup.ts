import "server-only";
import { and, count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { bootstrapAdmins, bootstrapCode } from "@/lib/authz";
import { platformNeedsBootstrap } from "@/lib/dal/platform";
import { googleCredentials, settingsOverview } from "@/lib/dal/settings";

/**
 * What a fresh deployment still needs.
 *
 * A blueprint that asks for nothing has to say, afterwards, what is missing —
 * otherwise "it deployed" and "it works" drift apart silently. Every line names
 * the thing, its state, and what to do about it, in that order.
 */
export type CheckState = "OK" | "TODO" | "WARN";

export interface Check {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  /** What to do, when there is something to do. */
  action?: string;
}

export interface SetupReport {
  /** The URL the service answers on, as the request sees it. */
  origin: string;
  googleRedirectUri: string;
  google: { configured: boolean; source: "ENV" | "CONSOLE" | "NONE"; clientId: string | null; secretHint: string | null };
  coingecko: { configured: boolean; hint: string | null };
  admins: number;
  bootstrapOpen: boolean;
  checks: Check[];
  ready: boolean;
}

/** The public origin, read from the proxy headers the host sets. */
export async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function setupReport(): Promise<SetupReport> {
  const db = await getDb();
  const [origin, google, overview, needsBootstrap] = await Promise.all([
    publicOrigin(),
    googleCredentials(),
    settingsOverview(),
    platformNeedsBootstrap(),
  ]);
  const [{ value: admins }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.platformRole, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));

  const googleRedirectUri = `${origin}/api/auth/callback/google`;
  const secret = overview.find((o) => o.key === "google.clientSecret");
  const gecko = overview.find((o) => o.key === "coingecko.apiKey");
  const devLogin = process.env.AUTH_DEV_LOGIN === "true";
  const managed = Boolean(process.env.DATABASE_URL);
  const encryption = (process.env.APP_ENCRYPTION_KEY ?? "").length >= 16;

  const checks: Check[] = [
    {
      key: "database",
      label: "Base de données",
      state: managed ? "OK" : "WARN",
      detail: managed
        ? "PostgreSQL managée, migrations appliquées au démarrage."
        : "Base embarquée (PGlite) dans .data/pglite : parfait en local, à ne pas utiliser en production.",
      action: managed ? undefined : "Renseignez DATABASE_URL, ou déployez avec le blueprint Render qui la crée.",
    },
    {
      key: "encryption",
      label: "Chiffrement des clés d'échange",
      state: encryption ? "OK" : "TODO",
      detail: encryption
        ? "APP_ENCRYPTION_KEY en place : les clés API sont chiffrées en AES-256-GCM."
        : "APP_ENCRYPTION_KEY absente ou trop courte : aucune clé d'échange ne peut être enregistrée.",
      action: encryption ? undefined : "Ajoutez APP_ENCRYPTION_KEY (32 octets aléatoires) dans l'environnement.",
    },
    {
      key: "google",
      label: "Connexion Google",
      state: google.source === "NONE" ? "TODO" : "OK",
      detail:
        google.source === "ENV"
          ? "Configurée par l'environnement (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)."
          : google.source === "CONSOLE"
            ? "Configurée depuis cette console."
            : "Personne ne peut encore se connecter avec Google.",
      action: google.source === "NONE" ? "Collez l'identifiant et le secret ci-dessous : l'effet est immédiat, sans redéploiement." : undefined,
    },
    {
      key: "admin",
      label: "Administrateur",
      state: admins > 0 ? "OK" : "TODO",
      detail:
        admins > 0
          ? `${admins} administrateur(s) actif(s)${needsBootstrap ? "" : " — la porte de démarrage est fermée."}`
          : "Aucun administrateur : la plateforme attend son premier.",
      action: admins > 0 ? undefined : "Utilisez le code de démarrage sur l'écran de connexion.",
    },
    {
      key: "devlogin",
      label: "Mode démonstration",
      state: devLogin ? "WARN" : "OK",
      detail: devLogin
        ? "AUTH_DEV_LOGIN=true : n'importe quelle adresse déjà ouverte entre sans mot de passe."
        : "Désactivé, comme il se doit en production.",
      action: devLogin ? "Passez AUTH_DEV_LOGIN à false avant d'ouvrir le service à des clients." : undefined,
    },
    {
      key: "pricing",
      label: "Cours de secours",
      state: "OK",
      detail: gecko?.set
        ? "CoinGecko avec clé : quota confortable."
        : "CoinGecko sans clé : le service public suffit au démarrage, une clé évite les limites.",
    },
  ];

  if (bootstrapAdmins().length) {
    checks.push({
      key: "envadmins",
      label: "Administrateurs déclarés dans l'environnement",
      state: "OK",
      detail: `SUPER_ADMIN_EMAILS : ${bootstrapAdmins().join(", ")} — promus à chaque connexion.`,
    });
  }
  if (!bootstrapCode() && admins === 0) {
    checks.push({
      key: "nocode",
      label: "Code de démarrage",
      state: "TODO",
      detail: "Aucun ADMIN_BOOTSTRAP_CODE : personne ne peut devenir le premier administrateur.",
      action: "Ajoutez ADMIN_BOOTSTRAP_CODE (12 caractères au moins) dans l'environnement, puis reconnectez-vous.",
    });
  }

  return {
    origin,
    googleRedirectUri,
    google: { configured: google.source !== "NONE", source: google.source, clientId: google.source === "CONSOLE" ? google.clientId : null, secretHint: secret?.hint ?? null },
    coingecko: { configured: Boolean(gecko?.set), hint: gecko?.hint ?? null },
    admins,
    bootstrapOpen: needsBootstrap,
    checks,
    ready: checks.every((c) => c.state !== "TODO"),
  };
}
