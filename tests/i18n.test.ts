import { describe, it, expect } from "vitest";
import { LOCALES, STRINGS, localeFor, pickLocale, t } from "@/lib/i18n";
import { COUNTRY_ORDER, COUNTRY_PACKS } from "@/lib/countries/registry";

describe("interface translations", () => {
  it("carries both languages for every key", () => {
    for (const [key, value] of Object.entries(STRINGS)) {
      expect(value.fr, `${key}.fr`).toBeTruthy();
      expect(value.en, `${key}.en`).toBeTruthy();
    }
    expect(LOCALES.map((l) => l.code)).toEqual(["fr", "en"]);
  });

  it("returns the asked language and falls back to French", () => {
    expect(t("nav.tax", "en")).toBe("Tax");
    expect(t("nav.tax", "fr")).toBe("Fiscalité");
    expect(pickLocale({ fr: "oui", en: "yes" }, "en")).toBe("yes");
  });

  it("reads the interface language from the entity, with an explicit preference winning", () => {
    expect(localeFor("fr-FR")).toBe("fr");
    expect(localeFor("de-AT")).toBe("en");
    expect(localeFor("de-AT", "fr-CA")).toBe("fr");
  });
});

describe("country packs are translated where it matters", () => {
  it("names every country in both languages", () => {
    for (const code of COUNTRY_ORDER) {
      const p = COUNTRY_PACKS[code];
      expect(p.name.fr, `${code}.fr`).toBeTruthy();
      expect(p.name.en, `${code}.en`).toBeTruthy();
    }
  });

  it("keeps legal and accounting vocabulary in the country's own language", () => {
    // The point of `native` is that an account or a rule keeps the name the
    // practice actually uses, rather than a translation nobody would search for.
    expect(COUNTRY_PACKS.AT.individual.kind === "GAINS" && COUNTRY_PACKS.AT.individual.costMethodLabel.native).toBe("Gleitender Durchschnittspreis");
    expect(COUNTRY_PACKS.CH.individual.kind === "WEALTH" && COUNTRY_PACKS.CH.individual.referenceLabel.native).toContain("Vermögenssteuer");
    expect(COUNTRY_PACKS.NL.individual.kind === "WEALTH" && COUNTRY_PACKS.NL.individual.referenceLabel.native).toContain("peildatum");
  });

  it("offers each country an interface language its users would want", () => {
    for (const code of COUNTRY_ORDER) {
      const locales = COUNTRY_PACKS[code].uiLocales;
      expect(locales.length, code).toBeGreaterThan(0);
      expect(locales.every((l) => l === "fr" || l === "en"), `${code}: ${locales.join(",")}`).toBe(true);
    }
  });
});
