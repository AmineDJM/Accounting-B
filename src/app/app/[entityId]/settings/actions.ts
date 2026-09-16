"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { deleteEntity, inviteMember, removeMember, revokeInvitation, updateEntity } from "@/lib/dal/entities";
import { DEFAULT_CHART, type ChartOfAccounts } from "@/lib/engine/chart";

export type Result = { ok: true; message?: string; link?: string } | { ok: false; error: string };

const entitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["COMPANY", "INDIVIDUAL"]),
  siren: z.string().trim().regex(/^\d{9}$/).optional().or(z.literal("")),
  legalForm: z.string().trim().max(32).optional().or(z.literal("")),
  fiscalYearEndMonth: z.coerce.number().int().min(1).max(12),
  fiscalYearEndDay: z.coerce.number().int().min(1).max(31),
  costMethod: z.enum(["CUMP", "FIFO"]),
});

export async function updateEntityAction(entityId: string, input: Record<string, string>): Promise<Result> {
  try {
    const user = await requireUser();
    const d = entitySchema.parse(input);
    await updateEntity(user.id, entityId, { name: d.name, kind: d.kind, siren: d.siren || null, legalForm: d.legalForm || null, fiscalYearEndMonth: d.fiscalYearEndMonth, fiscalYearEndDay: d.fiscalYearEndDay, costMethod: d.costMethod });
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Dossier mis à jour" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateChartAction(entityId: string, overrides: Record<string, { number: string; label: string }>, flags: { capitalizeFees: boolean }): Promise<Result> {
  try {
    const user = await requireUser();
    const clean: Record<string, unknown> = { capitalizeFees: flags.capitalizeFees };
    for (const [key, v] of Object.entries(overrides)) {
      if (!(key in DEFAULT_CHART)) continue;
      const def = DEFAULT_CHART[key as keyof ChartOfAccounts];
      if (typeof def !== "object") continue;
      const number = v.number.trim().replace(/[^0-9A-Za-z]/g, "");
      if (number.length < 3 || number.length > 13) return { ok: false, error: `Numéro invalide pour ${key} (3 à 13 caractères)` };
      if (number !== def.number || v.label.trim() !== def.label) clean[key] = { number, label: v.label.trim().slice(0, 100) || def.label };
    }
    await updateEntity(user.id, entityId, { chartOverrides: clean });
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Plan de comptes enregistré" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateExternalHoldingsAction(entityId: string, text: string): Promise<Result> {
  try {
    const user = await requireUser();
    const holdings: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Za-z0-9]{2,12})\s*[:=;, ]\s*([0-9]+(?:[.,][0-9]+)?)$/);
      if (!m) { if (line.trim()) return { ok: false, error: `Ligne illisible : « ${line.trim()} » (attendu : BTC 0.5)` }; continue; }
      holdings[m[1].toUpperCase()] = m[2].replace(",", ".");
    }
    await updateEntity(user.id, entityId, { settings: { externalHoldings: holdings } });
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Avoirs externes enregistrés" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function inviteAction(entityId: string, email: string, role: "ADMIN" | "ACCOUNTANT" | "VIEWER"): Promise<Result> {
  try {
    const user = await requireUser();
    if (!z.string().email().safeParse(email).success) return { ok: false, error: "E-mail invalide" };
    const { token } = await inviteMember(user.id, entityId, email, role);
    revalidatePath(`/app/${entityId}/settings`);
    const base = process.env.AUTH_URL ?? "";
    return { ok: true, message: "Invitation créée", link: `${base}/app/invite/${token}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeMemberAction(entityId: string, memberUserId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await removeMember(user.id, entityId, memberUserId);
    revalidatePath(`/app/${entityId}/settings`);
    return { ok: true, message: "Membre retiré" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function revokeInvitationAction(entityId: string, invitationId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await revokeInvitation(user.id, entityId, invitationId);
    revalidatePath(`/app/${entityId}/settings`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteEntityAction(entityId: string): Promise<Result> {
  const user = await requireUser();
  try {
    await deleteEntity(user.id, entityId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  redirect("/app");
}
