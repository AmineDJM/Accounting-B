import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, entities, entityMembers, exchangeAccounts, fiscalYears, invitations, users, type EntityKind, type MemberRole } from "@/lib/db/schema";
import { randomBytes } from "node:crypto";
import { fiscalYearBoundsZoned } from "@/lib/engine/tz";

export type Entity = typeof entities.$inferSelect;
export type FiscalYear = typeof fiscalYears.$inferSelect;
export type Membership = { entity: Entity; role: MemberRole };

export class AccessError extends Error {
  constructor(message = "Accès refusé") { super(message); this.name = "AccessError"; }
}

const ROLE_RANK: Record<MemberRole, number> = { VIEWER: 0, ACCOUNTANT: 1, ADMIN: 2, OWNER: 3 };

export async function listEntitiesForUser(userId: string): Promise<Membership[]> {
  const db = await getDb();
  const rows = await db
    .select({ entity: entities, role: entityMembers.role })
    .from(entityMembers)
    .innerJoin(entities, eq(entities.id, entityMembers.entityId))
    .where(eq(entityMembers.userId, userId))
    .orderBy(desc(entities.createdAt));
  return rows.map((r) => ({ entity: r.entity, role: r.role }));
}

/** Loads an entity and enforces membership with a minimum role. Throws AccessError otherwise. */
export async function requireEntity(userId: string, entityId: string, minRole: MemberRole = "VIEWER"): Promise<Membership> {
  const db = await getDb();
  const [row] = await db
    .select({ entity: entities, role: entityMembers.role })
    .from(entityMembers)
    .innerJoin(entities, eq(entities.id, entityMembers.entityId))
    .where(and(eq(entityMembers.userId, userId), eq(entityMembers.entityId, entityId)))
    .limit(1);
  if (!row) throw new AccessError("Dossier introuvable ou accès refusé");
  if (ROLE_RANK[row.role] < ROLE_RANK[minRole]) throw new AccessError("Droits insuffisants pour cette action");
  return { entity: row.entity, role: row.role };
}

export interface CreateEntityInput {
  name: string;
  kind: EntityKind;
  siren?: string | null;
  legalForm?: string | null;
  fiscalYearEndMonth?: number;
  fiscalYearEndDay?: number;
  costMethod?: "CUMP" | "FIFO";
  firstFiscalYearStart?: Date;
}

export async function createEntity(userId: string, input: CreateEntityInput): Promise<Entity> {
  const db = await getDb();
  const [entity] = await db
    .insert(entities)
    .values({
      name: input.name.trim(),
      kind: input.kind,
      siren: input.siren?.replace(/\D/g, "") || null,
      legalForm: input.legalForm ?? null,
      fiscalYearEndMonth: input.fiscalYearEndMonth ?? 12,
      fiscalYearEndDay: input.fiscalYearEndDay ?? 31,
      costMethod: input.costMethod ?? "CUMP",
      createdBy: userId,
    })
    .returning();
  await db.insert(entityMembers).values({ entityId: entity.id, userId, role: "OWNER" });
  await ensureFiscalYears(entity, input.firstFiscalYearStart ?? new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)));
  await db.update(users).set({ lastEntityId: entity.id }).where(eq(users.id, userId));
  await db.insert(auditLog).values({ entityId: entity.id, userId, action: "entity.create", details: { name: entity.name, kind: entity.kind } });
  return entity;
}

/** Computes fiscal year boundaries [start, end] containing `date` for an entity's closing month/day. */
export function fiscalYearBounds(entity: Pick<Entity, "fiscalYearEndMonth" | "fiscalYearEndDay">, date: Date): { start: Date; end: Date; label: string } {
  return fiscalYearBoundsZoned(entity.fiscalYearEndMonth, entity.fiscalYearEndDay, date);
}

/** Creates fiscal years from `from` until the current one (idempotent). */
export async function ensureFiscalYears(entity: Entity, from: Date): Promise<FiscalYear[]> {
  const db = await getDb();
  const existing = await db.select().from(fiscalYears).where(eq(fiscalYears.entityId, entity.id));
  const known = new Set(existing.map((f) => f.startDate.toISOString()));
  let cursor = fiscalYearBounds(entity, from);
  const now = new Date();
  const toInsert: (typeof fiscalYears.$inferInsert)[] = [];
  for (let i = 0; i < 30; i++) {
    if (!known.has(cursor.start.toISOString())) toInsert.push({ entityId: entity.id, label: cursor.label, startDate: cursor.start, endDate: cursor.end });
    if (cursor.end > now) break;
    cursor = fiscalYearBounds(entity, new Date(cursor.end.getTime() + 24 * 60 * 60 * 1000));
  }
  if (toInsert.length) await db.insert(fiscalYears).values(toInsert);
  return db.select().from(fiscalYears).where(eq(fiscalYears.entityId, entity.id)).orderBy(fiscalYears.startDate);
}

export async function listFiscalYears(entityId: string): Promise<FiscalYear[]> {
  const db = await getDb();
  return db.select().from(fiscalYears).where(eq(fiscalYears.entityId, entityId)).orderBy(fiscalYears.startDate);
}

export async function updateEntity(userId: string, entityId: string, patch: Partial<Pick<Entity, "name" | "siren" | "legalForm" | "fiscalYearEndMonth" | "fiscalYearEndDay" | "costMethod" | "chartOverrides" | "settings" | "kind">>): Promise<Entity> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  const [row] = await db.update(entities).set({ ...patch, updatedAt: new Date() }).where(eq(entities.id, entityId)).returning();
  await db.insert(auditLog).values({ entityId, userId, action: "entity.update", details: { fields: Object.keys(patch) } });
  return row;
}

export async function deleteEntity(userId: string, entityId: string): Promise<void> {
  await requireEntity(userId, entityId, "OWNER");
  const db = await getDb();
  await db.delete(entities).where(eq(entities.id, entityId));
}

export async function setLastEntity(userId: string, entityId: string): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ lastEntityId: entityId }).where(eq(users.id, userId));
}

export async function listMembers(userId: string, entityId: string) {
  await requireEntity(userId, entityId, "VIEWER");
  const db = await getDb();
  const members = await db.select({ userId: users.id, email: users.email, name: users.name, image: users.image, role: entityMembers.role, since: entityMembers.createdAt }).from(entityMembers).innerJoin(users, eq(users.id, entityMembers.userId)).where(eq(entityMembers.entityId, entityId));
  const pending = await db.select().from(invitations).where(eq(invitations.entityId, entityId));
  return { members, pending: pending.filter((p) => !p.acceptedAt && p.expiresAt > new Date()) };
}

export async function inviteMember(userId: string, entityId: string, email: string, role: MemberRole): Promise<{ token: string }> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  await db.insert(invitations).values({ entityId, email: email.trim().toLowerCase(), role, token, invitedBy: userId, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });
  await db.insert(auditLog).values({ entityId, userId, action: "member.invite", details: { email, role } });
  return { token };
}

export async function acceptInvitation(userId: string, userEmail: string | null, token: string): Promise<Entity> {
  const db = await getDb();
  const [inv] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new AccessError("Invitation invalide ou expirée");
  if (userEmail && inv.email !== userEmail.toLowerCase()) throw new AccessError(`Cette invitation est destinée à ${inv.email}`);
  await db.insert(entityMembers).values({ entityId: inv.entityId, userId, role: inv.role }).onConflictDoNothing();
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
  const [entity] = await db.select().from(entities).where(eq(entities.id, inv.entityId));
  await db.update(users).set({ lastEntityId: entity.id }).where(eq(users.id, userId));
  return entity;
}

export async function removeMember(userId: string, entityId: string, memberUserId: string): Promise<void> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  const owners = await db.select().from(entityMembers).where(and(eq(entityMembers.entityId, entityId), eq(entityMembers.role, "OWNER")));
  if (owners.length === 1 && owners[0].userId === memberUserId) throw new AccessError("Impossible de retirer le dernier propriétaire");
  await db.delete(entityMembers).where(and(eq(entityMembers.entityId, entityId), eq(entityMembers.userId, memberUserId)));
}

export async function revokeInvitation(userId: string, entityId: string, invitationId: string): Promise<void> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  await db.delete(invitations).where(and(eq(invitations.id, invitationId), eq(invitations.entityId, entityId)));
}

export async function countAccounts(entityIds: string[]): Promise<Map<string, number>> {
  const db = await getDb();
  if (entityIds.length === 0) return new Map();
  const rows = await db.select({ entityId: exchangeAccounts.entityId }).from(exchangeAccounts).where(inArray(exchangeAccounts.entityId, entityIds));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.entityId, (m.get(r.entityId) ?? 0) + 1);
  return m;
}
