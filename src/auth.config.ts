import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js configuration shared by the full server-side instance (with the
 * database adapter) and the lightweight instance used in `proxy.ts`
 * (cookie/JWT check only, no database access).
 *
 * It declares no provider: the proxy only reads the session cookie, and the
 * full instance adds the providers it can actually serve — Google when a client
 * exists in the environment or in the database, the start-up door while the
 * platform has no administrator.
 *
 * `trustHost` matters more than it looks: it lets Auth.js derive its own URL
 * from the request, so a deployment needs no AUTH_URL and works on whatever
 * hostname the host gives it.
 */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
