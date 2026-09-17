import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import { authConfig, devLoginEnabled } from "./auth.config";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { admitSignIn, claimPlatform, resolveActor, touch, type Actor } from "@/lib/dal/platform";
import { googleCredentials } from "@/lib/dal/settings";

/**
 * Full Auth.js instance: Google sign-in persisted through the Drizzle adapter,
 * a start-up door for the very first administrator, and an optional "demo
 * login" (email only) enabled with AUTH_DEV_LOGIN=true for local development,
 * tests and screenshots. Never enable that last one in production.
 *
 * The configuration is built per request rather than at import time, because
 * the Google client may live in the database: an administrator pastes it into
 * the console and sign-in starts working on the next request, with no
 * redeployment and nothing to type when the service is first created.
 *
 * There is no self-service sign-up. An address that no administrator created is
 * refused even with a valid Google account, and a suspended one is refused
 * until it is reactivated. The exceptions are the addresses in
 * SUPER_ADMIN_EMAILS and the holder of the start-up code, because the first
 * administrator cannot be created by an administrator.
 */
/** Providers that carry their own admission check, so `signIn` lets them past. */
const SELF_ADMITTED = new Set(["dev-login", "bootstrap"]);

const devLogin = Credentials({
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
});

/**
 * The start-up door.
 *
 * It opens only while the platform has no administrator, and it closes by
 * itself the moment one exists. `claimPlatform` does the checking; a wrong code
 * and a closed window return the same nothing.
 */
const bootstrapLogin = Credentials({
  id: "bootstrap",
  name: "Code de démarrage",
  credentials: { email: { label: "E-mail", type: "email" }, code: { label: "Code de démarrage", type: "password" }, name: { label: "Nom", type: "text" } },
  async authorize(creds) {
    const admin = await claimPlatform(String(creds?.email ?? ""), String(creds?.code ?? ""), { name: String(creds?.name ?? "") || null });
    if (!admin) return null;
    return { id: admin.id, email: admin.email, name: admin.name, image: admin.image };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  // Opened here rather than at import time: a build worker that loads this
  // module must not spin up a database (an embedded PGlite instance, during a
  // build) just to collect route metadata. `getDb` memoises, so a request pays
  // for it once.
  const db = await getDb();
  const providers: NextAuthConfig["providers"] = [];
  const google = await googleCredentials();
  if (google.clientId && google.clientSecret) {
    providers.push(
      Google({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        allowDangerousEmailAccountLinking: false,
        authorization: { params: { prompt: "select_account", access_type: "online", scope: "openid email profile" } },
      }),
    );
  }
  if (devLoginEnabled) providers.push(devLogin);
  providers.push(bootstrapLogin);

  return {
    ...authConfig,
    adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
    providers,
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ user, account, profile }) {
        // These providers already ran their own admission check in `authorize`.
        if (account?.provider && SELF_ADMITTED.has(account.provider)) return true;
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
  };
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
