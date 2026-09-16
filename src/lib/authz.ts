import { isSupportedCountry } from "@/lib/countries/registry";
import type { CountryCode } from "@/lib/countries/types";
import type { AccountStatusKind, PlatformRole } from "@/lib/db/schema";

/**
 * Who may do what.
 *
 * Deliberately free of any server dependency: these are the rules that grant or
 * refuse access, they are pure functions of an actor, and they are the part of
 * the system most worth testing on its own. The server module that loads an
 * actor from the database re-exports them.
 */
export class PlatformError extends Error {
  constructor(message: string, readonly code: "SUSPENDED" | "NOT_INVITED" | "NOT_ADMIN" | "READ_ONLY" | "COUNTRY") {
    super(message);
    this.name = "PlatformError";
  }
}

export interface Actor {
  /** The account whose data is being read: the target while viewing as. */
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: PlatformRole;
  status: AccountStatusKind;
  countries: string[];
  /** The administrator behind the session, set only while viewing as. */
  viewingAs: { adminId: string; adminEmail: string | null; impersonationId: string; since: Date; expiresAt: Date; reason: string } | null;
}

/**
 * The people who can bootstrap the platform.
 *
 * The first administrator cannot be created by an administrator, so the
 * addresses in SUPER_ADMIN_EMAILS are promoted on sign-in. Everyone else is
 * created from the console. Leaving the variable unset means nobody can let
 * themselves in, which is a safer failure than an open door.
 */
export function bootstrapAdmins(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@") && e.length > 3);
}

/** The countries an account may open a file in, as pack codes. */
export function allowedCountries(actor: Pick<Actor, "role" | "countries">): CountryCode[] {
  return actor.countries
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is CountryCode => isSupportedCountry(c));
}

export function assertCountryAllowed(actor: Pick<Actor, "role" | "countries">, country: string): void {
  // An administrator is not limited: they have to be able to open any file to
  // reproduce a problem a client reports.
  if (actor.role === "SUPER_ADMIN") return;
  const code = country.trim().toUpperCase();
  if (!allowedCountries(actor).includes(code as CountryCode)) {
    throw new PlatformError(
      `Ce compte n'a pas accès aux règles de ce pays. Demandez à l'administrateur d'ajouter ${code} aux pays autorisés.`,
      "COUNTRY",
    );
  }
}

/**
 * Throws while an administrator is viewing as someone.
 *
 * Looking at a client's file to understand a problem is support; writing in it
 * under their name is not, and it would turn the audit trail into a fiction.
 * Every mutation goes through here.
 */
export function assertCanWrite(actor: Pick<Actor, "status" | "viewingAs">): void {
  if (actor.viewingAs) {
    throw new PlatformError(
      "Vous consultez ce compte en lecture seule. Quittez le mode « voir comme » pour agir, ou demandez au titulaire du compte de le faire.",
      "READ_ONLY",
    );
  }
  if (actor.status !== "ACTIVE") {
    throw new PlatformError("Ce compte est désactivé.", "SUSPENDED");
  }
}
