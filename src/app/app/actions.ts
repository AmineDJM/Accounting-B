"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, signOut } from "@/auth";
import { acceptInvitation, createEntity, setLastEntity } from "@/lib/dal/entities";
import { assertCanWrite, assertCountryAllowed, PlatformError } from "@/lib/dal/platform";
import { startFullRefresh } from "@/lib/services/refresh";
import { requireActor } from "@/auth";

const createSchema = z.object({
  kind: z.enum(["COMPANY", "INDIVIDUAL"]),
  country: z.enum(["FR", "DE", "AT", "ES", "IT", "PT", "BE", "NL", "CH", "AE", "OM", "QA"]).default("FR"),
  name: z.string().trim().min(2, "Nom trop court").max(120),
  siren: z.string().trim().regex(/^\d{9}$/, "Le SIREN comporte 9 chiffres").optional().or(z.literal("")),
  taxId: z.string().trim().max(32).optional().or(z.literal("")),
  legalForm: z.string().trim().max(32).optional().or(z.literal("")),
  fiscalYearEndMonth: z.coerce.number().int().min(1).max(12).default(12),
  fiscalYearEndDay: z.coerce.number().int().min(1).max(31).default(31),
  costMethod: z.enum(["CUMP", "FIFO"]).default("CUMP"),
  firstYear: z.coerce.number().int().min(2013).max(2100).default(new Date().getUTCFullYear() - 1),
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

export async function createEntityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const user = { id: actor.id };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "Vérifiez le formulaire", fieldErrors };
  }
  const d = parsed.data;
  // The country is an entitlement, not a preference: a file can only be opened
  // under rules the administrator granted this account.
  try {
    assertCanWrite(actor);
    assertCountryAllowed(actor, d.country);
  } catch (e) {
    if (e instanceof PlatformError) return { error: e.message, fieldErrors: e.code === "COUNTRY" ? { country: e.message } : undefined };
    throw e;
  }
  const entity = await createEntity(user.id, {
    name: d.name,
    kind: d.kind,
    country: d.country,
    siren: d.siren || null,
    taxId: d.taxId || null,
    legalForm: d.legalForm || null,
    fiscalYearEndMonth: d.kind === "INDIVIDUAL" ? 12 : d.fiscalYearEndMonth,
    fiscalYearEndDay: d.kind === "INDIVIDUAL" ? 31 : d.fiscalYearEndDay,
    costMethod: d.costMethod,
    firstFiscalYearStart: new Date(Date.UTC(d.firstYear, 0, 1)),
  });
  redirect(`/app/${entity.id}/accounts?welcome=1`);
}

export async function switchEntityAction(entityId: string) {
  const user = await requireUser();
  await setLastEntity(user.id, entityId);
  redirect(`/app/${entityId}/dashboard`);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function acceptInvitationAction(token: string) {
  const user = await requireUser();
  const entity = await acceptInvitation(user.id, user.email, token);
  revalidatePath("/app");
  redirect(`/app/${entity.id}/dashboard`);
}

/**
 * One button for the whole chain: synchronise every connected platform, value
 * the operations, generate the journal and recompute the tax. It reports into a
 * single job, so there is one thing to watch.
 */
export async function refreshAllAction(entityId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const actor = await requireActor();
    assertCanWrite(actor);
    const job = await startFullRefresh(actor.id, entityId);
    return { ok: true, id: job.id };
  } catch (e) {
    return { ok: false, error: e instanceof PlatformError ? e.message : (e as Error).message };
  }
}
