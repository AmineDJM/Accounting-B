/**
 * Interface language.
 *
 * Two languages are carried in full, French and English, because the product is
 * sold to French-speaking practices and used by their clients across twelve
 * countries. A third language is added by adding a column here, not by
 * scattering strings through components.
 *
 * Legal and accounting vocabulary is deliberately *not* here: an account label,
 * a form box and an article citation live in the country pack, in the language
 * of the country, because "Anlagevermögen" is not a translation choice — it is
 * the name of the thing in the chart the practice actually uses.
 */
export type Locale = "fr" | "en";

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export const DEFAULT_LOCALE: Locale = "fr";

type Dict = Record<string, { fr: string; en: string }>;

export const STRINGS = {
  "nav.dashboard": { fr: "Tableau de bord", en: "Dashboard" },
  "nav.accounts": { fr: "Comptes & imports", en: "Accounts & imports" },
  "nav.transactions": { fr: "Transactions", en: "Transactions" },
  "nav.journal": { fr: "Journal comptable", en: "Ledger" },
  "nav.tax": { fr: "Fiscalité", en: "Tax" },
  "nav.dac8": { fr: "Rapprochement DAC8", en: "DAC8 reconciliation" },
  "nav.exports": { fr: "Exports", en: "Exports" },
  "nav.settings": { fr: "Paramètres", en: "Settings" },
  "nav.clients": { fr: "Portefeuille clients", en: "Client portfolio" },
  "nav.newFile": { fr: "Nouveau dossier", en: "New file" },

  "common.compute": { fr: "Calculer", en: "Compute" },
  "common.recompute": { fr: "Recalculer", en: "Recompute" },
  "common.import": { fr: "Importer", en: "Import" },
  "common.download": { fr: "Télécharger", en: "Download" },
  "common.delete": { fr: "Supprimer", en: "Delete" },
  "common.back": { fr: "Retour", en: "Back" },
  "common.continue": { fr: "Continuer", en: "Continue" },
  "common.year": { fr: "Année", en: "Year" },
  "common.asset": { fr: "Actif", en: "Asset" },
  "common.quantity": { fr: "Quantité", en: "Quantity" },
  "common.amount": { fr: "Montant", en: "Amount" },
  "common.date": { fr: "Date", en: "Date" },
  "common.never": { fr: "jamais", en: "never" },

  "tax.title": { fr: "Fiscalité personnelle", en: "Personal tax" },
  "tax.proceeds": { fr: "Cessions", en: "Disposals" },
  "tax.gains": { fr: "Plus et moins-values", en: "Gains and losses" },
  "tax.base": { fr: "Base imposable", en: "Taxable base" },
  "tax.estimated": { fr: "Impôt estimé", en: "Estimated tax" },
  "tax.exempt": { fr: "non imposé", en: "not taxed" },
  "tax.taxable": { fr: "imposable", en: "taxable" },
  "tax.howObtained": { fr: "Comment ce montant est obtenu", en: "How this figure is reached" },
  "tax.formBoxes": { fr: "Cases à reporter", en: "Boxes to report" },
  "tax.assumptions": { fr: "Hypothèses retenues", en: "Assumptions made" },
  "tax.textsApplied": { fr: "Textes appliqués", en: "Texts applied" },
  "tax.position": { fr: "Position déclarée", en: "Declared position" },
  "tax.tokenIncome": { fr: "Revenus en jetons", en: "Token income" },

  "dac8.title": { fr: "Rapprochement DAC8", en: "DAC8 reconciliation" },
  "dac8.import": { fr: "Importer un relevé", en: "Import a statement" },
  "dac8.statements": { fr: "Relevés reçus", en: "Statements received" },
  "dac8.reconcile": { fr: "Rapprocher", en: "Reconcile" },
  "dac8.feeTreatment": { fr: "Traitement des frais", en: "Fee treatment" },
  "dac8.net": { fr: "Net de frais", en: "Net of fees" },
  "dac8.gross": { fr: "Brut", en: "Gross" },
  "dac8.expected": { fr: "Ce que vos livres déclarent", en: "What your books would report" },
  "dac8.whatToDo": { fr: "Ce qu'il faut faire", en: "What to do" },
  "dac8.eightElements": { fr: "Les huit éléments du CARF", en: "The eight CARF elements" },

  "status.match": { fr: "Concordant", en: "Match" },
  "status.minor": { fr: "Écart mineur", en: "Minor difference" },
  "status.difference": { fr: "Écart", en: "Difference" },
  "status.missingInApp": { fr: "Absent de vos livres", en: "Missing from your books" },
  "status.missingInStatement": { fr: "Absent du relevé", en: "Missing from the statement" },

  "workflow.todo": { fr: "À faire", en: "To do" },
  "workflow.inProgress": { fr: "En cours", en: "In progress" },
  "workflow.review": { fr: "À réviser", en: "Under review" },
  "workflow.done": { fr: "Terminé", en: "Done" },

  "draft.title": { fr: "Règles non relues", en: "Rules not yet reviewed" },
  "draft.body": {
    fr: "Les textes cités ont été lus et encodés, mais aucun professionnel local ne les a validés. Les hypothèses retenues sont listées sur chaque calcul : vérifiez-les avant toute déclaration.",
    en: "The texts cited have been read and encoded, but no local professional has validated them. The assumptions made are listed on every computation: check them before filing.",
  },
} satisfies Dict;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, locale: Locale = DEFAULT_LOCALE): string {
  return STRINGS[key][locale] ?? STRINGS[key].fr;
}

/** Picks the field of a localised object carried by a country pack. */
export const pickLocale = <T extends { fr: string; en: string }>(value: T, locale: Locale = DEFAULT_LOCALE): string =>
  locale === "en" ? value.en : value.fr;

/** Reads the locale from an entity's stored locale ("de-AT" → "en" unless French). */
export function localeFor(entityLocale: string | null | undefined, preferred?: string | null): Locale {
  const p = (preferred ?? "").slice(0, 2).toLowerCase();
  if (p === "fr" || p === "en") return p;
  return (entityLocale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Formats a number in the entity's own locale, which is not the interface language. */
export function formatMoney(value: string | number, currency: string, entityLocale = "fr-FR"): string {
  return new Intl.NumberFormat(entityLocale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}
