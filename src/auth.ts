import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { authConfig, devLoginEnabled } from "./auth.config";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { admitSignIn, resolveActor, touch, type Actor } from "@/lib/dal/platform";

/**
 * Full Auth.js instance: Google sign-in persisted through the Drizzle adapter,
 * plus an optional "demo login" (email only) enabled with AUTH_DEV_LOGIN=true
 * for local development, tests and screenshots. Never enable it in production.
 *
 * There is no self-service sign-up. An address that no administrator created is
 * refused even with a valid Google account, and a suspended one is refused
 * until it is reactivated. The only exception is a bootstrap administrator
 * named in SUPER_ADMIN_EMAILS, because the first administrator cannot be
 * created by an administrator.
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
        // The demo login takes the same door as Google: it skips the password,
        // not the admission rules.
        const admitted = await admitSignIn(email, { name: String(creds?.name ?? "") || null });
        if (!admitted.ok) return null;
        return { id: admitted.user.id, email: admitted.user.email, name: admitted.user.name, image: admitted.user.image };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // The credentials provider already ran `admitSignIn` in `authorize`.
      if (account?.provider === "dev-login") return true;
      const admitted = await admitSignIn(user.email, { name: profile?.name ?? user.name, image: (profile?.picture as string | undefined) ?? user.image });
      if (admitted.ok) {
        user.id = admitted.user.id;
        return true;
      }
      // The reason reaches the login page as a query parameter, so a person
      // refused for the wrong reason knows who to ask.
      return `/login?denied=${admitted.reason.toLowerCase()}`;
    },
  },
});

export type { Actor };

/**
 * The account whose data the request may read.
 *
 * While an administrator is viewing as someone, this returns the target, and
 * `actor.viewingAs` says who is really behind the screen. Mutations call
 * `assertCanWrite` with the same object.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const actor = await resolveActor(session.user.id);
  if (!actor) throw new Error("UNAUTHENTICATED");
  if (actor.status === "SUSPENDED" && !actor.viewingAs) throw new Error("SUSPENDED");
  return actor;
}

/** The signed-in account itself, never the impersonated one. */
export async function requireSignedIn(): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return { id: session.user.id };
}

export async function markSeen(userId: string): Promise<void> {
  await touch(userId).catch(() => {});
}

/**
 * The identity every page and action has always used.
 *
 * It now returns the *effective* account, so a page an administrator opens
 * while viewing as someone reads that person's data without every caller
 * having to know about it. `viewingAs` travels with it for the ones that do.
 */
export async function requireUser() {
  const actor = await requireActor();
  return {
    id: actor.id,
    email: actor.email,
    name: actor.name,
    image: actor.image,
    role: actor.role,
    status: actor.status,
    countries: actor.countries,
    viewingAs: actor.viewingAs,
  };
}
