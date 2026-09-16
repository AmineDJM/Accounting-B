import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditLog, dac8Reconciliations, dac8Statements, entities, entityMembers, exchangeAccounts,
  firms, fiscalYears, impersonations, jobs, journalRuns, taxRuns, transactions, users,
  type AccountStatusKind, type PlatformRole,
} from "@/lib/db/schema";
import { COUNTRY_ORDER, getPack, isSupportedCountry } from "@/lib/countries/registry";
import { PlatformError, requireAdmin } from "@/lib/dal/platform";
import type { CountryCode } from "@/lib/countries/types";

export type AdminUser = typeof users.$inferSelect;

const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ Accounts */

export interface AccountRow {
  id: string;
  email: string | null;
  name: string | null;
  company: string | null;
  role: PlatformRole;
  status: AccountStatusKind;
  countries: string[];
  createdAt: Date;
  activatedAt: Date | null;
  lastSeenAt: Date | null;
  suspendedReason: string | null;
  adminNote: string | null;
  /** What the account actually does, which is what decides whether it is worth keeping. */
  usage: { entities: number; transactions: number; taxRuns: number; journalRuns: number; reconciliations: number };
}

/** Every account with the figures that say whether it is alive. */
export async function listAccounts(adminId: string): Promise<AccountRow[]> {
  await requireAdmin(adminId);
  const db = await getDb();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const owned = await db
    .select({ userId: entityMembers.userId, entityId: entityMembers.entityId })
    .from(entityMembers)
    .where(inArray(entityMembers.userId, ids));
  const byUser = new Map<string, string[]>();
  for (const o of owned) byUser.set(o.userId, [...(byUser.get(o.userId) ?? []), o.entityId]);

  const allEntityIds = [...new Set(owned.map((o) => o.entityId))];
  const counts = allEntityIds.length
    ? {
        tx: await db.select({ entityId: transactions.entityId, n: count() }).from(transactions).where(inArray(transactions.entityId, allEntityIds)).groupBy(transactions.entityId),
        tax: await db.select({ entityId: taxRuns.entityId, n: count() }).from(taxRuns).where(inArray(taxRuns.entityId, allEntityIds)).groupBy(taxRuns.entityId),
        journal: await db.select({ entityId: journalRuns.entityId, n: count() }).from(journalRuns).where(inArray(journalRuns.entityId, allEntityIds)).groupBy(journalRuns.entityId),
        recon: await db.select({ entityId: dac8Reconciliations.entityId, n: count() }).from(dac8Reconciliations).where(inArray(dac8Reconciliations.entityId, allEntityIds)).groupBy(dac8Reconciliations.entityId),
      }
    : { tx: [], tax: [], journal: [], recon: [] };
  const index = (rowsIn: { entityId: string; n: number }[]) => new Map(rowsIn.map((r) => [r.entityId, r.n]));
  const tx = index(counts.tx), tax = index(counts.tax), journal = index(counts.journal), recon = index(counts.recon);
  const sumFor = (m: Map<string, number>, list: string[]) => list.reduce((a, id) => a + (m.get(id) ?? 0), 0);

  return rows.map((u) => {
    const mine = byUser.get(u.id) ?? [];
    return {
      id: u.id, email: u.email, name: u.name, company: u.company,
      role: u.platformRole, status: u.status, countries: u.countries ?? [],
      createdAt: u.createdAt, activatedAt: u.activatedAt, lastSeenAt: u.lastSeenAt,
      suspendedReason: u.suspendedReason, adminNote: u.adminNote,
      usage: {
        entities: mine.length,
        transactions: sumFor(tx, mine),
        taxRuns: sumFor(tax, mine),
        journalRuns: sumFor(journal, mine),
        reconciliations: sumFor(recon, mine),
      },
    };
  });
}

export interface CreateAccountInput {
  email: string;
  name?: string;
  company?: string;
  countries: string[];
  role?: PlatformRole;
  /** Activate straight away, or leave the account invited until it is configured. */
  activate?: boolean;
  note?: string;
}

/** Creates an account. Nobody else can: there is no sign-up form. */
export async function createAccount(adminId: string, input: CreateAccountInput): Promise<AdminUser> {
  const admin = await requireAdmin(adminId);
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) throw new PlatformError("Adresse e-mail invalide.", "NOT_ADMIN");
  const countries = normaliseCountries(input.countries);
  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new PlatformError(`Un compte existe déjà pour ${email}.`, "NOT_ADMIN");

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: input.name?.trim() || email.split("@")[0],
      company: input.company?.trim() || null,
      platformRole: input.role ?? "USER",
      status: input.activate ? "ACTIVE" : "INVITED",
      countries,
      adminNote: input.note?.trim() || null,
      createdByAdminId: adminId,
      activatedAt: input.activate ? new Date() : null,
    })
    .returning();
  await db.insert(auditLog).values({
    userId: adminId, action: "platform.account.create",
    details: { by: admin.email, email, countries, role: created.platformRole, status: created.status },
  });
  return created;
}

export async function setAccountStatus(adminId: string, userId: string, status: AccountStatusKind, reason?: string): Promise<AdminUser> {
  const admin = await requireAdmin(adminId);
  if (userId === adminId && status !== "ACTIVE") {
    throw new PlatformError("Vous ne pouvez pas désactiver votre propre compte : demandez à un autre administrateur.", "NOT_ADMIN");
  }
  const db = await getDb();
  const [updated] = await db
    .update(users)
    .set({
      status,
      activatedAt: status === "ACTIVE" ? new Date() : undefined,
      suspendedAt: status === "SUSPENDED" ? new Date() : null,
      suspendedReason: status === "SUSPENDED" ? reason?.trim() || "Non précisé" : null,
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new PlatformError("Compte introuvable.", "NOT_ADMIN");
  // A suspended account keeps its data and loses its door: any open view-as
  // session on it is closed too.
  if (status === "SUSPENDED") {
    await db.update(impersonations).set({ endedAt: new Date() }).where(and(eq(impersonations.targetUserId, userId), isNull(impersonations.endedAt)));
  }
  await db.insert(auditLog).values({
    userId: adminId, action: "platform.account.status",
    details: { by: admin.email, target: updated.email, status, reason: reason ?? null },
  });
  return updated;
}

/** Sets which countries an account may open files in. */
export async function setAccountCountries(adminId: string, userId: string, countries: string[]): Promise<AdminUser> {
  const admin = await requireAdmin(adminId);
  const normalised = normaliseCountries(countries);
  const db = await getDb();

  // Countries already used by this account's files cannot simply disappear:
  // the files would become unreadable. They are reported rather than dropped.
  const inUse = await db
    .select({ country: entities.country })
    .from(entityMembers)
    .innerJoin(entities, eq(entities.id, entityMembers.entityId))
    .where(eq(entityMembers.userId, userId));
  const orphaned = [...new Set(inUse.map((r) => r.country))].filter((c) => !normalised.includes(c as CountryCode));

  const [updated] = await db.update(users).set({ countries: normalised }).where(eq(users.id, userId)).returning();
  if (!updated) throw new PlatformError("Compte introuvable.", "NOT_ADMIN");
  await db.insert(auditLog).values({
    userId: adminId, action: "platform.account.countries",
    details: { by: admin.email, target: updated.email, countries: normalised, orphaned },
  });
  return updated;
}

export async function setAccountRole(adminId: string, userId: string, role: PlatformRole): Promise<AdminUser> {
  const admin = await requireAdmin(adminId);
  if (userId === adminId && role !== "SUPER_ADMIN") {
    throw new PlatformError("Vous ne pouvez pas retirer vos propres droits d'administration.", "NOT_ADMIN");
  }
  const db = await getDb();
  const [updated] = await db.update(users).set({ platformRole: role }).where(eq(users.id, userId)).returning();
  if (!updated) throw new PlatformError("Compte introuvable.", "NOT_ADMIN");
  await db.insert(auditLog).values({ userId: adminId, action: "platform.account.role", details: { by: admin.email, target: updated.email, role } });
  return updated;
}

export async function setAccountNote(adminId: string, userId: string, note: string): Promise<void> {
  await requireAdmin(adminId);
  const db = await getDb();
  await db.update(users).set({ adminNote: note.trim() || null }).where(eq(users.id, userId));
}

/** Countries that a file already uses but the account is no longer entitled to. */
export async function orphanedCountries(adminId: string, userId: string): Promise<string[]> {
  await requireAdmin(adminId);
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return [];
  const rows = await db
    .select({ country: entities.country })
    .from(entityMembers)
    .innerJoin(entities, eq(entities.id, entityMembers.entityId))
    .where(eq(entityMembers.userId, userId));
  const allowed = new Set(u.countries ?? []);
  return [...new Set(rows.map((r) => r.country))].filter((c) => !allowed.has(c));
}

function normaliseCountries(list: string[]): CountryCode[] {
  const wanted = new Set(list.map((c) => c.trim().toUpperCase()).filter((c) => isSupportedCountry(c)));
  // Keep the display order stable so the console never reshuffles.
  return COUNTRY_ORDER.filter((c) => wanted.has(c));
}

/**
 * Splits the active accounts into the two lists an operator acts on.
 *
 * Volume hides engagement: an account that signed in once and imported nothing
 * is not a customer, and one that worked for six months and then went quiet is
 * a different problem from one that never started. The clock is read here, in a
 * server module, rather than inside a component.
 */
export function engagement(accounts: AccountRow[], now: Date = new Date()) {
  const active = accounts.filter((a) => a.status === "ACTIVE");
  const cutoff = now.getTime() - 30 * DAY;
  return {
    active,
    ranked: [...active].sort((a, b) => b.usage.transactions - a.usage.transactions),
    neverStarted: active.filter((a) => a.usage.entities === 0),
    dormant: active.filter((a) => a.usage.entities > 0 && (!a.lastSeenAt || a.lastSeenAt.getTime() < cutoff)),
    producing: active.filter((a) => a.usage.taxRuns + a.usage.journalRuns > 0),
  };
}

/* ------------------------------------------------------------------ Metrics */

export interface PlatformMetrics {
  accounts: { total: number; active: number; invited: number; suspended: number; admins: number; seenLast7: number; seenLast30: number; createdLast30: number };
  files: { total: number; companies: number; individuals: number; byCountry: { country: string; name: string; flag: string; files: number; accounts: number }[] };
  work: { transactions: number; journalRuns: number; taxRuns: number; statements: number; reconciliations: number; exchangeAccounts: number; firms: number };
  activity: { day: string; transactions: number }[];
  jobs: { kind: string; status: string; n: number }[];
  failures: { id: string; entityId: string; kind: string; message: string | null; at: Date }[];
  /** Files whose country pack is still a draft: the operator's own risk register. */
  draftExposure: { country: string; name: string; flag: string; files: number }[];
  impersonations: { open: number; last30: number };
}

/**
 * Everything the operator needs on one screen.
 *
 * The figures answer three questions in order: who is using the service, what
 * they are producing with it, and what is broken. The draft exposure is the
 * fourth and the uncomfortable one — how many client files rest on rules no
 * local professional has signed off.
 */
export async function metrics(adminId: string): Promise<PlatformMetrics> {
  await requireAdmin(adminId);
  const db = await getDb();
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY);
  const since30 = new Date(now - 30 * DAY);

  const allUsers = await db.select().from(users);
  const allEntities = await db.select({ id: entities.id, country: entities.country, kind: entities.kind }).from(entities);
  const members = await db.select({ userId: entityMembers.userId, entityId: entityMembers.entityId }).from(entityMembers);

  const accountsByCountry = new Map<string, Set<string>>();
  const entityCountry = new Map(allEntities.map((e) => [e.id, e.country]));
  for (const m of members) {
    const c = entityCountry.get(m.entityId);
    if (!c) continue;
    accountsByCountry.set(c, (accountsByCountry.get(c) ?? new Set()).add(m.userId));
  }

  const filesByCountry = new Map<string, number>();
  for (const e of allEntities) filesByCountry.set(e.country, (filesByCountry.get(e.country) ?? 0) + 1);

  const [{ n: txCount } = { n: 0 }] = await db.select({ n: count() }).from(transactions);
  const [{ n: journalCount } = { n: 0 }] = await db.select({ n: count() }).from(journalRuns);
  const [{ n: taxCount } = { n: 0 }] = await db.select({ n: count() }).from(taxRuns);
  const [{ n: statementCount } = { n: 0 }] = await db.select({ n: count() }).from(dac8Statements);
  const [{ n: reconCount } = { n: 0 }] = await db.select({ n: count() }).from(dac8Reconciliations);
  const [{ n: accountCount } = { n: 0 }] = await db.select({ n: count() }).from(exchangeAccounts);
  const [{ n: firmCount } = { n: 0 }] = await db.select({ n: count() }).from(firms);

  const activity = await db
    .select({ day: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`, n: count() })
    .from(transactions)
    .where(gte(transactions.createdAt, since30))
    .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`);

  const jobRows = await db.select({ kind: jobs.kind, status: jobs.status, n: count() }).from(jobs).groupBy(jobs.kind, jobs.status);
  const failures = await db
    .select({ id: jobs.id, entityId: jobs.entityId, kind: jobs.kind, message: jobs.message, at: jobs.createdAt })
    .from(jobs)
    .where(eq(jobs.status, "FAILED"))
    .orderBy(desc(jobs.createdAt))
    .limit(10);

  const [{ n: openImpersonations } = { n: 0 }] = await db.select({ n: count() }).from(impersonations).where(isNull(impersonations.endedAt));
  const [{ n: recentImpersonations } = { n: 0 }] = await db.select({ n: count() }).from(impersonations).where(gte(impersonations.startedAt, since30));

  const byCountry = [...filesByCountry.entries()]
    .map(([country, files]) => {
      const pack = getPack(country);
      return { country, name: pack.name.fr, flag: pack.flag, files, accounts: accountsByCountry.get(country)?.size ?? 0 };
    })
    .sort((a, b) => b.files - a.files);

  return {
    accounts: {
      total: allUsers.length,
      active: allUsers.filter((u) => u.status === "ACTIVE").length,
      invited: allUsers.filter((u) => u.status === "INVITED").length,
      suspended: allUsers.filter((u) => u.status === "SUSPENDED").length,
      admins: allUsers.filter((u) => u.platformRole === "SUPER_ADMIN").length,
      seenLast7: allUsers.filter((u) => u.lastSeenAt && u.lastSeenAt >= since7).length,
      seenLast30: allUsers.filter((u) => u.lastSeenAt && u.lastSeenAt >= since30).length,
      createdLast30: allUsers.filter((u) => u.createdAt >= since30).length,
    },
    files: {
      total: allEntities.length,
      companies: allEntities.filter((e) => e.kind === "COMPANY").length,
      individuals: allEntities.filter((e) => e.kind === "INDIVIDUAL").length,
      byCountry,
    },
    work: {
      transactions: txCount, journalRuns: journalCount, taxRuns: taxCount,
      statements: statementCount, reconciliations: reconCount,
      exchangeAccounts: accountCount, firms: firmCount,
    },
    activity: activity.map((a) => ({ day: a.day, transactions: a.n })),
    jobs: jobRows.map((j) => ({ kind: j.kind, status: j.status, n: j.n })),
    failures,
    draftExposure: byCountry.filter((c) => getPack(c.country).review.status !== "REVIEWED").map(({ country, name, flag, files }) => ({ country, name, flag, files })),
    impersonations: { open: openImpersonations, last30: recentImpersonations },
  };
}

/* -------------------------------------------------------------------- Audit */

export async function recentAudit(adminId: string, limit = 100) {
  await requireAdmin(adminId);
  const db = await getDb();
  return db
    .select({
      id: auditLog.id, action: auditLog.action, details: auditLog.details, createdAt: auditLog.createdAt,
      entityId: auditLog.entityId, userEmail: users.email, userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function impersonationHistory(adminId: string, limit = 50) {
  await requireAdmin(adminId);
  const db = await getDb();
  const rows = await db
    .select({
      id: impersonations.id, reason: impersonations.reason, startedAt: impersonations.startedAt,
      endedAt: impersonations.endedAt, expiresAt: impersonations.expiresAt,
      adminId: impersonations.adminId, targetUserId: impersonations.targetUserId,
    })
    .from(impersonations)
    .orderBy(desc(impersonations.startedAt))
    .limit(limit);
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.adminId, r.targetUserId]))];
  const people = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(inArray(users.id, ids));
  const by = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    admin: by.get(r.adminId) ?? null,
    target: by.get(r.targetUserId) ?? null,
    open: r.endedAt === null && r.expiresAt > new Date(),
  }));
}

/** The files an account can reach, for the account's detail page. */
export async function accountFiles(adminId: string, userId: string) {
  await requireAdmin(adminId);
  const db = await getDb();
  const rows = await db
    .select({
      entity: entities, role: entityMembers.role,
      transactions: sql<number>`(select count(*)::int from ${transactions} t where t.entity_id = ${entities.id})`,
    })
    .from(entityMembers)
    .innerJoin(entities, eq(entities.id, entityMembers.entityId))
    .where(eq(entityMembers.userId, userId))
    .orderBy(desc(entities.createdAt));
  const years = rows.length
    ? await db.select().from(fiscalYears).where(inArray(fiscalYears.entityId, rows.map((r) => r.entity.id)))
    : [];
  return rows.map((r) => ({
    id: r.entity.id,
    name: r.entity.name,
    kind: r.entity.kind,
    country: r.entity.country,
    countryName: getPack(r.entity.country).name.fr,
    flag: getPack(r.entity.country).flag,
    currency: r.entity.baseCurrency,
    role: r.role,
    transactions: r.transactions,
    createdAt: r.entity.createdAt,
    fiscalYears: years.filter((y) => y.entityId === r.entity.id).length,
  }));
}

/** Accounts with an open view-as session right now. */
export async function openImpersonations(adminId: string) {
  await requireAdmin(adminId);
  const db = await getDb();
  return db
    .select()
    .from(impersonations)
    .where(and(isNull(impersonations.endedAt), isNotNull(impersonations.expiresAt)))
    .orderBy(desc(impersonations.startedAt))
    .limit(20);
}
