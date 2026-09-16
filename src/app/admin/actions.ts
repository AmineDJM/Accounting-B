"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSignedIn } from "@/auth";
import { IMPERSONATION_COOKIE, IMPERSONATION_TTL_MS, PlatformError, startImpersonation, stopImpersonation } from "@/lib/dal/platform";
import {
  createAccount, setAccountCountries, setAccountNote, setAccountRole, setAccountStatus,
} from "@/lib/services/admin";
import { requireAdmin } from "@/lib/dal/platform";
import { setSetting } from "@/lib/dal/settings";
import type { AccountStatusKind, PlatformRole } from "@/lib/db/schema";

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

const fail = (e: unknown): AdminResult => ({ ok: false, error: e instanceof PlatformError ? e.message : (e as Error).message });

export async function createAccountAction(form: FormData): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    const countries = form.getAll("countries").map(String);
    const user = await createAccount(id, {
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? "") || undefined,
      company: String(form.get("company") ?? "") || undefined,
      countries,
      role: (String(form.get("role") ?? "USER") as PlatformRole) === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER",
      activate: form.get("activate") === "on",
      note: String(form.get("note") ?? "") || undefined,
    });
    revalidatePath("/admin/accounts");
    revalidatePath("/admin");
    return { ok: true, message: `Compte ${user.email} créé${user.status === "ACTIVE" ? " et activé" : " — activez-le quand il est prêt"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setStatusAction(userId: string, status: AccountStatusKind, reason?: string): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    await setAccountStatus(id, userId, status, reason);
    revalidatePath("/admin/accounts");
    revalidatePath(`/admin/accounts/${userId}`);
    revalidatePath("/admin");
    return { ok: true, message: status === "ACTIVE" ? "Compte activé." : status === "SUSPENDED" ? "Compte désactivé." : "Compte remis en attente." };
  } catch (e) {
    return fail(e);
  }
}

export async function setCountriesAction(userId: string, countries: string[]): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    await setAccountCountries(id, userId, countries);
    revalidatePath(`/admin/accounts/${userId}`);
    revalidatePath("/admin/accounts");
    return { ok: true, message: countries.length ? `${countries.length} pays ouverts.` : "Aucun pays ouvert : ce compte ne pourra créer aucun dossier." };
  } catch (e) {
    return fail(e);
  }
}

export async function setRoleAction(userId: string, role: PlatformRole): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    await setAccountRole(id, userId, role);
    revalidatePath(`/admin/accounts/${userId}`);
    revalidatePath("/admin/accounts");
    return { ok: true, message: role === "SUPER_ADMIN" ? "Droits d'administration accordés." : "Droits d'administration retirés." };
  } catch (e) {
    return fail(e);
  }
}

export async function setNoteAction(userId: string, note: string): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    await setAccountNote(id, userId, note);
    revalidatePath(`/admin/accounts/${userId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Opens a read-only view of someone else's account.
 *
 * The cookie only names which of the administrator's own open sessions to use;
 * the authority is the row in the database, so a forged cookie opens nothing.
 * It is scoped to the app, http-only, and expires with the session it names.
 */
export async function viewAsAction(userId: string, reason: string): Promise<AdminResult> {
  const target = "/app";
  try {
    const { id } = await requireSignedIn();
    const row = await startImpersonation(id, userId, reason);
    const jar = await cookies();
    jar.set(IMPERSONATION_COOKIE, row.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
    });
  } catch (e) {
    return fail(e);
  }
  redirect(target);
}

export async function stopViewAsAction(): Promise<void> {
  const { id } = await requireSignedIn();
  const jar = await cookies();
  const current = jar.get(IMPERSONATION_COOKIE)?.value;
  if (current) await stopImpersonation(id, current);
  jar.delete(IMPERSONATION_COOKIE);
  redirect("/admin/accounts");
}

/**
 * The Google client, pasted from the console.
 *
 * An empty secret keeps the stored one, so an administrator can correct the
 * identifier without having to fetch the secret from Google again.
 */
export async function saveGoogleAction(form: FormData): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    await requireAdmin(id);
    if (form.get("clear")) {
      await setSetting("google.clientId", null, id);
      await setSetting("google.clientSecret", null, id);
      revalidatePath("/admin/setup");
      return { ok: true, message: "Client Google retiré." };
    }
    const clientId = String(form.get("clientId") ?? "").trim();
    const clientSecret = String(form.get("clientSecret") ?? "").trim();
    if (!clientId) return { ok: false, error: "Indiquez l'identifiant client." };
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      return { ok: false, error: "Cet identifiant ne ressemble pas à un client Google (il finit par .apps.googleusercontent.com)." };
    }
    await setSetting("google.clientId", clientId, id);
    if (clientSecret) await setSetting("google.clientSecret", clientSecret, id);
    revalidatePath("/admin/setup");
    revalidatePath("/login");
    return { ok: true, message: clientSecret ? "Connexion Google configurée." : "Identifiant enregistré (secret inchangé)." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCoingeckoAction(form: FormData): Promise<AdminResult> {
  try {
    const { id } = await requireSignedIn();
    await requireAdmin(id);
    const clear = Boolean(form.get("clear"));
    const key = String(form.get("apiKey") ?? "").trim();
    if (!clear && !key) return { ok: false, error: "Collez une clé, ou retirez celle qui est enregistrée." };
    await setSetting("coingecko.apiKey", clear ? null : key, id);
    revalidatePath("/admin/setup");
    return { ok: true, message: clear ? "Clé retirée." : "Clé enregistrée." };
  } catch (e) {
    return fail(e);
  }
}
