import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { authConfig, devLoginEnabled } from "./auth.config";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

/**
 * Full Auth.js instance: Google sign-in persisted through the Drizzle adapter,
 * plus an optional "demo login" (email only) enabled with AUTH_DEV_LOGIN=true
 * for local development, tests and screenshots. Never enable it in production.
 */
const db = await getDb();

const providers: NextAuthConfig["providers"] = [...authConfig.providers];
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Connexion de démonstration",
      credentials: { email: { label: "E-mail", type: "email" }, name: { label: "Nom", type: "text" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!email || !email.includes("@")) return null;
        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing[0]) return { id: existing[0].id, email: existing[0].email, name: existing[0].name, image: existing[0].image };
        const [created] = await db.insert(users).values({ email, name: String(creds?.name ?? email.split("@")[0]), emailVerified: new Date() }).returning();
        return { id: created.id, email: created.email, name: created.name, image: created.image };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  providers,
  events: {
    async createUser({ user }) {
      void user;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return { id: session.user.id, email: session.user.email ?? null, name: session.user.name ?? null, image: session.user.image ?? null };
}
