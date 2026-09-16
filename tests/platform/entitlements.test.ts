import { describe, it, expect } from "vitest";
import { allowedCountries, assertCanWrite, assertCountryAllowed, bootstrapAdmins, PlatformError, type Actor } from "@/lib/authz";

/**
 * The rules that decide who may do what.
 *
 * They are pure functions on an actor, deliberately, so the part of the system
 * that grants or refuses access can be tested without a database, a session or
 * a browser — and so a change to it fails here rather than in production.
 */
const actor = (over: Partial<Actor> = {}): Actor => ({
  id: "u1", email: "u@example.com", name: "U", image: null,
  role: "USER", status: "ACTIVE", countries: ["FR", "BE"], viewingAs: null,
  ...over,
});

const viewing: Actor["viewingAs"] = {
  adminId: "admin", adminEmail: "admin@example.com", impersonationId: "imp1",
  since: new Date(), expiresAt: new Date(Date.now() + 3600_000), reason: "ticket #412",
};

describe("country entitlements", () => {
  it("keeps only the countries the platform actually supports", () => {
    expect(allowedCountries(actor({ countries: ["FR", "BE", "XX", "de"] }))).toEqual(["FR", "BE", "DE"]);
  });

  it("lets an account open a file in a granted country, whatever the case", () => {
    expect(() => assertCountryAllowed(actor(), "FR")).not.toThrow();
    expect(() => assertCountryAllowed(actor(), "be")).not.toThrow();
  });

  it("refuses a country nobody granted, and names it", () => {
    try {
      assertCountryAllowed(actor(), "DE");
      throw new Error("should have refused");
    } catch (e) {
      expect(e).toBeInstanceOf(PlatformError);
      expect((e as PlatformError).code).toBe("COUNTRY");
      expect((e as Error).message).toContain("DE");
    }
  });

  it("refuses every country to an account with no entitlement", () => {
    expect(() => assertCountryAllowed(actor({ countries: [] }), "FR")).toThrow(PlatformError);
    expect(allowedCountries(actor({ countries: [] }))).toEqual([]);
  });

  it("does not limit an administrator, who has to be able to reproduce any file", () => {
    expect(() => assertCountryAllowed(actor({ role: "SUPER_ADMIN", countries: [] }), "QA")).not.toThrow();
  });
});

describe("write protection", () => {
  it("lets an ordinary active account act", () => {
    expect(() => assertCanWrite(actor())).not.toThrow();
  });

  it("refuses every write while an administrator is viewing as someone", () => {
    try {
      assertCanWrite(actor({ role: "SUPER_ADMIN", viewingAs: viewing }));
      throw new Error("should have refused");
    } catch (e) {
      expect(e).toBeInstanceOf(PlatformError);
      expect((e as PlatformError).code).toBe("READ_ONLY");
      expect((e as Error).message).toContain("lecture seule");
    }
  });

  it("refuses a suspended or not-yet-activated account holding a session", () => {
    expect(() => assertCanWrite(actor({ status: "SUSPENDED" }))).toThrow(PlatformError);
    expect(() => assertCanWrite(actor({ status: "INVITED" }))).toThrow(PlatformError);
  });
});

describe("bootstrap administrators", () => {
  it("reads the addresses that may promote themselves, in any separator", () => {
    process.env.SUPER_ADMIN_EMAILS = "Ops@Example.com, second@example.com;third@example.com";
    expect(bootstrapAdmins()).toEqual(["ops@example.com", "second@example.com", "third@example.com"]);
  });

  it("grants nobody when the variable is unset, closing the door rather than opening it", () => {
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(bootstrapAdmins()).toEqual([]);
  });

  it("ignores anything that is not an address", () => {
    process.env.SUPER_ADMIN_EMAILS = "not-an-address,,   ,ok@example.com";
    expect(bootstrapAdmins()).toEqual(["ok@example.com"]);
    delete process.env.SUPER_ADMIN_EMAILS;
  });
});
