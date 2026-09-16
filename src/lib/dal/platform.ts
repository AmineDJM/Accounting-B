import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { auditLog, impersonations, users } from "@/lib/db/schema";
import { allowedCountries, assertCanWrite, assertCountryAllowed, AttemptLimiter, bootstrapAdmins, bootstrapCode, PlatformError, type Actor } from "@/lib/authz";
import { safeEqual } from "@/lib/security/crypto";

export { allowedCountries, assertCanWrite, assertCountryAllowed, bootstrapAdmins, bootstrapCode, PlatformError };
export type { Actor };

export type User = typeof users.$inferSelect;
export type Impersonation = typeof impersonations.$inferSelect;

/** How long a view-as session lasts before it closes itself. */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000;
export const IMPERSONATION_COOKIE = "finly_view_as";

/**
 * Decides whether an address may open a session at all.
 *
 * Self-service sign-up does not exist: an address that no administrator has
 * created is refused even with a valid Google account. The one exception is a
 * bootstrap administrator, who is created and activated on first sign-in.
 */
export async function admitSignIn(email: string | null | undefined, profile: { name?: string | null; image?: string | null } = {}): Promise<{ ok: true; user: User } | { ok: false; reason: "UNKNOWN" | "SUSPENDED" | "INVITED" }> {
  const address = (email ?? "").trim().toLowerCase();
  if (!address) return { ok: false, reason: "UNKNOWN" };
  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  const isBootstrap = bootstrapAdmins().includes(address);

  if (!existing) {
    if (!isBootstrap) return { ok: false, reason: "UNKNOWN" };
    const [created] = await db
      .insert(users)
      .values({
        email: address,
        name: profile.name ?? address.split("@")[0],
        image: profile.image ?? null,
        platformRole: "SUPER_ADMIN",
        status: "ACTIVE",
        countries: [],
        emailVerified: new Date(),
        activatedAt: new Date(),
      })
      .returning();
    await db.insert(auditLog).values({ userId: created.id, action: "platform.bootstrap", details: { email: address } });
    return { ok: true, user: created };
  }

  // A bootstrap address keeps its powers even if the row says otherwise: the
  // environment is the authority for who operates the service.
  if (isBootstrap && (existing.platformRole !== "SUPER_ADMIN" || existing.status !== "ACTIVE")) {
    const [promoted] = await db
      .update(users)
      .set({ platformRole: "SUPER_ADMIN", status: "ACTIVE", activatedAt: existing.activatedAt ?? new Date(), suspendedAt: null, suspendedReason: null })
      .where(eq(users.id, existing.id))
      .returning();
    return { ok: true, user: promoted };
  }

  if (existing.status === "SUSPENDED") return { ok: false, reason: "SUSPENDED" };
  if (existing.status === "INVITED") return { ok: false, reason: "INVITED" };
  return { ok: true, user: existing };
}

/** The signed-in account, refreshed from the database rather than from the token. */
export async function loadUser(userId: string): Promise<User | null> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

/**
 * Resolves who is acting.
 *
 * While an administrator is viewing as someone, every read returns the target's
 * data and every write is refused. The authority is the open row in
 * `impersonations`, not the cookie: the cookie only names which of the
 * administrator's open sessions to use, so forging it grants nothing that the
 * database does not already allow.
 */
export async function resolveActor(sessionUserId: string): Promise<Actor | null> {
  const signedIn = await loadUser(sessionUserId);
  if (!signedIn) return null;
  const base: Actor = {
    id: signedIn.id,
    email: signedIn.email,
    name: signedIn.name,
    image: signedIn.image,
    role: signedIn.platformRole,
    status: signedIn.status,
    countries: signedIn.countries ?? [],
    viewingAs: null,
  };
  if (signedIn.platformRole !== "SUPER_ADMIN") return base;

  const jar = await cookies();
  const wanted = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!wanted) return base;

  const db = await getDb();
  const [open] = await db
    .select()
    .from(impersonations)
    .where(and(eq(impersonations.id, wanted), eq(impersonations.adminId, signedIn.id), isNull(impersonations.endedAt), gt(impersonations.expiresAt, new Date())))
    .limit(1);
  if (!open) return base;

  const target = await loadUser(open.targetUserId);
  if (!target) return base;
  return {
    id: target.id,
    email: target.email,
    name: target.name,
    image: target.image,
    role: target.platformRole,
    status: target.status,
    countries: target.countries ?? [],
    viewingAs: {
      adminId: signedIn.id,
      adminEmail: signedIn.email,
      impersonationId: open.id,
      since: open.startedAt,
      expiresAt: open.expiresAt,
      reason: open.reason,
    },
  };
}

/** Throws unless the signed-in account is an administrator acting as itself. */
export async function requireAdmin(sessionUserId: string): Promise<User> {
  const user = await loadUser(sessionUserId);
  if (!user || user.platformRole !== "SUPER_ADMIN" || user.status !== "ACTIVE") {
    throw new PlatformError("Console d'administration réservée aux administrateurs de la plateforme.", "NOT_ADMIN");
  }
  return user;
}

/** Records that an account was seen, for the console's activity figures. */
export async function touch(userId: string): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
}

/** Opens a view-as session and returns the id the cookie will carry. */
export async function startImpersonation(adminId: string, targetUserId: string, reason: string): Promise<Impersonation> {
  const admin = await requireAdmin(adminId);
  if (targetUserId === adminId) throw new PlatformError("Vous êtes déjà connecté avec ce compte.", "NOT_ADMIN");
  const target = await loadUser(targetUserId);
  if (!target) throw new PlatformError("Compte introuvable.", "NOT_ADMIN");
  const trimmed = reason.trim();
  if (trimmed.length < 8) throw new PlatformError("Indiquez le motif de la consultation : il est conservé et communicable au titulaire du compte.", "NOT_ADMIN");

  const db = await getDb();
  // One open session at a time keeps the audit unambiguous.
  await db.update(impersonations).set({ endedAt: new Date() }).where(and(eq(impersonations.adminId, adminId), isNull(impersonations.endedAt)));
  const agent = (await headers()).get("user-agent");
  const [row] = await db
    .insert(impersonations)
    .values({ adminId, targetUserId, reason: trimmed, expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS), userAgent: agent?.slice(0, 200) ?? null })
    .returning();
  await db.insert(auditLog).values({
    userId: adminId,
    action: "platform.impersonate.start",
    details: { targetUserId, targetEmail: target.email, reason: trimmed, admin: admin.email },
  });
  return row;
}

export async function stopImpersonation(adminId: string, impersonationId: string): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .update(impersonations)
    .set({ endedAt: new Date() })
    .where(and(eq(impersonations.id, impersonationId), eq(impersonations.adminId, adminId)))
    .returning();
  if (row) {
    await db.insert(auditLog).values({
      userId: adminId,
      action: "platform.impersonate.stop",
      details: { targetUserId: row.targetUserId, minutes: Math.round((Date.now() - row.startedAt.getTime()) / 60000) },
    });
  }
}

/* --------------------------------------------------------- First run */

const claimLimiter = new AttemptLimiter();

/**
 * True while the platform has no administrator and a start-up code is set.
 *
 * The login page asks this to decide whether to offer the start-up form, and
 * `claimPlatform` asks it again before acting, so the window closes the moment
 * the first administrator exists.
 */
export async function platformNeedsBootstrap(): Promise<boolean> {
  if (!bootstrapCode()) return false;
  const db = await getDb();
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.platformRole, "SUPER_ADMIN"), eq(users.status, "ACTIVE")))
    .limit(1);
  return !admin;
}

/**
 * Claims the platform with the start-up code.
 *
 * Returns the new administrator, or null when the code is wrong or the window
 * has closed — the caller shows the same message either way, so a stranger
 * learns nothing from which it was.
 */
export async function claimPlatform(email: string | null | undefined, code: string, profile: { name?: string | null } = {}): Promise<User | null> {
  const address = (email ?? "").trim().toLowerCase();
  const expected = bootstrapCode();
  if (!expected || !address.includes("@")) return null;
  if (!claimLimiter.allowed(address)) {
    throw new PlatformError("Trop de tentatives. Réessayez dans dix minutes.", "NOT_ADMIN");
  }
  if (!(await platformNeedsBootstrap())) return null;
  if (!safeEqual(code.trim(), expected)) {
    claimLimiter.fail(address);
    return null;
  }
  claimLimiter.clear(address);

  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  const now = new Date();
  const [admin] = existing
    ? await db
        .update(users)
        .set({ platformRole: "SUPER_ADMIN", status: "ACTIVE", activatedAt: existing.activatedAt ?? now, suspendedAt: null, suspendedReason: null })
        .where(eq(users.id, existing.id))
        .returning()
    : await db
        .insert(users)
        .values({
          email: address,
          name: profile.name?.trim() || address.split("@")[0],
          platformRole: "SUPER_ADMIN",
          status: "ACTIVE",
          countries: [],
          emailVerified: now,
          activatedAt: now,
        })
        .returning();
  await db.insert(auditLog).values({ userId: admin.id, action: "platform.claim", details: { email: address } });
  return admin;
}
