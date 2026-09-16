import { gainsEngine } from "@/lib/engine/tax/gains";
import { IFRS_GENERIC } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * Oman.
 *
 * Oman does not tax personal income today, but it is the first Gulf state that
 * has legislated to do so: the Personal Income Tax Law promulgated by royal
 * decree No. 56/2025 takes effect on 1 January 2028, at 5 % on net taxable
 * income above OMR 42,000 a year. Whether a crypto gain falls within its base
 * depends on the executive regulations, which the law requires within twelve
 * months of its publication. The pack therefore records the date and the rate
 * without asserting the treatment, and keeps the cost history complete so that
 * a basis exists when the regime starts.
 */
const REFS = {
  pit: { jurisdiction: "OM" as const, code: "Royal Decree No. 56/2025 — Personal Income Tax Law", title: "Impôt sur le revenu des personnes physiques : 5 % au-delà de 42 000 OMR de revenu net imposable, applicable au 1er janvier 2028", url: "https://tms.taxoman.gov.om/portal/w/issuance-of-personal-income-tax-pit-law", asOf: "2025-06-29" },
  cit: { jurisdiction: "OM" as const, code: "Royal Decree No. 28/2009 — Income Tax Law, art. 18", title: "Impôt sur les bénéfices : 15 %, et 3 % pour les petits établissements remplissant les conditions", asOf: "2026-01-01" },
  vat: { jurisdiction: "OM" as const, code: "Royal Decree No. 121/2020 — VAT Law", title: "Taxe sur la valeur ajoutée au taux de 5 % ; aucune disposition propre aux actifs virtuels", asOf: "2021-04-16" },
  cma: { jurisdiction: "OM" as const, code: "Capital Market Authority — Virtual Assets Regulatory Framework", title: "Cadre de régulation des actifs virtuels et des prestataires de services", url: "https://cma.gov.om/", asOf: "2025-01-01" },
  cbo: { jurisdiction: "OM" as const, code: "Central Bank of Oman", title: "Le rial omanais est rattaché au dollar au cours de 0,3845 OMR pour un dollar depuis 1986", url: "https://cbo.gov.om/", asOf: "2026-01-01" },
};

const NO_TAX = t(
  "Le sultanat d'Oman n'impose pas aujourd'hui le revenu des personnes physiques. Le résultat de chaque cession est calculé et tracé, mais aucun impôt personnel n'est dû à ce titre pour les années antérieures à 2028.",
  "Oman does not currently tax personal income. Every disposal is computed and traced, but no personal tax is due on it for years before 2028.",
);

const COMING = t(
  "La loi sur l'impôt sur le revenu des personnes physiques promulguée par le décret royal n° 56/2025 prend effet le 1er janvier 2028, au taux de 5 % sur le revenu net imposable dépassant 42 000 OMR par an. Le traitement des gains sur crypto-actifs dépendra du règlement d'exécution. Conservez dès maintenant l'historique complet des prix d'acquisition : c'est lui qui déterminera la base au démarrage du régime.",
  "The personal income tax law promulgated by royal decree No. 56/2025 takes effect on 1 January 2028 at 5 % on net taxable income above OMR 42,000 a year. How crypto gains are treated will depend on the executive regulations. Keep the full acquisition history now: it will decide the base when the regime starts.",
);

export const OM: CountryPack = {
  code: "OM",
  name: t("Oman", "Oman", "سلطنة عُمان"),
  flag: "🇴🇲",
  baseCurrency: "OMR",
  alternativeCurrencies: ["USD", "EUR"],
  timezone: "Asia/Muscat",
  locale: "en-OM",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    taxableDisposals: [],
    costMethod: "AVERAGE",
    costMethodLabel: t("Prix moyen pondéré (suivi de gestion, sans portée fiscale actuelle)", "Weighted average cost, for management purposes only"),
    perWallet: false,
    deductFees: true,
    capitaliseAcquisitionFees: true,
    noPersonalTax: NO_TAX,
    caveats: [
      COMING,
      t(
        "Le règlement d'exécution doit être publié dans les douze mois de la publication de la loi au journal officiel, intervenue le 29 juin 2025. Vérifiez sa parution avant de conclure sur le traitement d'un gain.",
        "The executive regulations are due within twelve months of the law's publication in the official gazette on 29 June 2025. Check that they have appeared before concluding on the treatment of a gain.",
      ),
      t(
        "Une activité menée à titre professionnel relève de l'impôt sur les bénéfices, au taux de 15 %, ou de 3 % pour les petits établissements qui remplissent les conditions.",
        "An activity carried on professionally falls under the profits tax at 15 %, or 3 % for qualifying small establishments.",
      ),
      t(
        "L'Autorité des marchés financiers a publié un cadre de régulation des actifs virtuels : l'exercice d'une activité de prestataire suppose une licence.",
        "The Capital Market Authority has published a virtual assets regulatory framework: acting as a service provider requires a licence.",
      ),
    ],
    years: { 2023: { notes: [NO_TAX, COMING] } },
    income: {
      taxedAtReceipt: false,
      acquisitionCost: "MARKET",
      category: t("Revenus en jetons — hors champ pour les années antérieures à 2028", "Token income — outside the scope for years before 2028"),
      note: t(
        "Les revenus de staking, de minage et les airdrops perçus par un particulier ne sont pas imposés à ce jour. Leur traitement à compter de 2028 dépendra du règlement d'exécution ; ils sont valorisés et conservés dans le dossier pour que la base soit disponible.",
        "Staking, mining and airdrop income received by an individual is not taxed today; the treatment from 2028 will depend on the executive regulations. They are valued and kept in the file so the base is available.",
      ),
      refs: [REFS.pit],
    },
    losses: {
      offsetWithinYear: false,
      carryForwardYears: 0,
      note: t("Sans imposition des gains, la question du report des pertes ne se pose pas encore pour un particulier.", "With no taxation of gains, loss carry-forward does not yet arise for an individual."),
    },
  },
  company: {
    framework: t("IFRS", "IFRS", "IFRS"),
    chart: IFRS_GENERIC,
    assetAccountWidth: 2,
    auditFile: "CSV",
    auditFileNote: t(
      "Aucun fichier des écritures normalisé n'est exigé. Les livres et pièces se conservent dix ans.",
      "No standardised audit file is required; books and vouchers are kept for ten years.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Coût diminué des dépréciations en IFRS, sauf pour un négociant appliquant l'évaluation à la juste valeur diminuée des coûts de vente.",
      "Cost less impairment under IFRS, except for a broker-trader measuring at fair value less costs to sell.",
    ),
    costMethods: ["AVERAGE", "FIFO"],
    corporateTax: [
      { label: t("Impôt sur les bénéfices — taux général", "Profits tax — general rate"), rate: "0.15" },
      { label: t("Petits établissements remplissant les conditions", "Qualifying small establishments"), rate: "0.03" },
    ],
    refs: [REFS.cit, REFS.vat],
  },
  forms: [],
  dac8: {
    inScope: false,
    note: t(
      "DAC8 est une directive de l'Union et ne s'applique pas à Oman. Un résident omanais détenant des avoirs auprès d'un prestataire établi dans l'Union sera néanmoins déclaré par celui-ci.",
      "DAC8 is an EU directive and does not apply to Oman; a resident holding assets with an EU provider will still be reported by it.",
    ),
  },
  assumptions: [
    t(
      "La date d'entrée en vigueur et le taux de l'impôt sur le revenu proviennent de la communication de l'autorité fiscale omanaise et des commentaires professionnels publiés à la suite du décret. Le texte du règlement d'exécution n'a pas été vérifié : rien ne permet encore d'affirmer qu'un gain sur crypto-actifs entre ou non dans la base.",
      "The effective date and rate come from the Omani tax authority's announcement and professional commentary following the decree. The executive regulations have not been verified, so nothing yet establishes whether a crypto gain is within the base.",
    ),
    t(
      "Le rial omanais est rattaché au dollar au cours de 0,3845 OMR pour un dollar. Les valorisations passent par ce cours et par le taux de référence euro-dollar de la BCE.",
      "The Omani rial is pegged at OMR 0.3845 to the dollar; valuations go through that peg and the ECB euro-dollar reference rate.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
