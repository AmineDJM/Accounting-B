import { gainsEngine } from "@/lib/engine/tax/gains";
import { IFRS_GENERIC } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * Qatar.
 *
 * No personal income tax. A natural person resident in Qatar owes nothing on a
 * crypto gain, and the questions that remain are on the business side: the
 * 10 % income tax on profits from an activity carried on in Qatar, the separate
 * Qatar Financial Centre regime, and the fact that the QFC digital assets
 * framework deliberately leaves crypto-currencies outside the tokens it admits.
 */
const REFS = {
  it: { jurisdiction: "QA" as const, code: "Law No. 24 of 2018 on the Income Tax Law", title: "Impôt sur le revenu limité aux bénéfices d'activité ; taux général de 10 %", url: "https://www.gta.gov.qa/", asOf: "2019-12-11" },
  qfc: { jurisdiction: "QA" as const, code: "QFC Digital Assets Framework 2024", title: "Cadre du Qatar Financial Centre sur les actifs numériques : les crypto-monnaies ne figurent pas parmi les jetons admis", url: "https://www.qfc.qa/", asOf: "2024-09-01" },
  qcb: { jurisdiction: "QA" as const, code: "Qatar Central Bank — Law No. 13 of 2012", title: "Le riyal qatari est rattaché au dollar au cours de 3,64 QAR pour un dollar", url: "https://www.qcb.gov.qa/", asOf: "2026-01-01" },
};

const NO_TAX = t(
  "Le Qatar n'impose pas le revenu des personnes physiques. Le résultat de chaque cession est calculé et tracé, mais aucun impôt personnel n'est dû à ce titre.",
  "Qatar does not tax personal income. Every disposal is computed and traced, but no personal tax is due on it.",
);

export const QA: CountryPack = {
  code: "QA",
  name: t("Qatar", "Qatar", "دولة قطر"),
  flag: "🇶🇦",
  baseCurrency: "QAR",
  alternativeCurrencies: ["USD", "EUR"],
  timezone: "Asia/Qatar",
  locale: "en-QA",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    taxableDisposals: [],
    costMethod: "AVERAGE",
    costMethodLabel: t("Prix moyen pondéré (suivi de gestion, sans portée fiscale)", "Weighted average cost, for management purposes only"),
    perWallet: false,
    deductFees: true,
    capitaliseAcquisitionFees: true,
    noPersonalTax: NO_TAX,
    caveats: [
      t(
        "L'impôt sur le revenu qatari ne frappe que les bénéfices d'une activité exercée au Qatar. Un négoce mené comme une entreprise sort donc de l'exonération et relève du taux de 10 %.",
        "Qatari income tax reaches only the profits of an activity carried on in Qatar; trading carried on as a business falls under the 10 % rate.",
      ),
      t(
        "Le cadre du Qatar Financial Centre sur les actifs numériques, publié en 2024, encadre la tokenisation mais exclut délibérément les crypto-monnaies des jetons admis. Une activité portant sur celles-ci ne trouve pas de régime dans ce cadre.",
        "The QFC digital assets framework of 2024 covers tokenisation but deliberately excludes crypto-currencies from the admitted tokens.",
      ),
      t(
        "Il n'existe pas de taxe sur la valeur ajoutée en vigueur au Qatar à ce jour, bien que l'accord-cadre du Conseil de coopération du Golfe en prévoie une.",
        "There is no value added tax in force in Qatar today, although the Gulf Cooperation Council framework agreement provides for one.",
      ),
      t(
        "Rien n'exonère des obligations du pays de départ : plusieurs États d'Europe taxent la perte de résidence comme une cession. Conservez la preuve de la date de transfert de résidence.",
        "Nothing here displaces the departure country's rules: several European States tax the loss of residence as a disposal.",
      ),
    ],
    years: { 2023: { notes: [NO_TAX] } },
    income: {
      taxedAtReceipt: false,
      acquisitionCost: "MARKET",
      category: t("Revenus en jetons — hors champ de l'impôt sur le revenu", "Token income — outside the scope of income tax"),
      note: t(
        "Le staking, le minage et les airdrops reçus par un particulier ne sont pas imposés. Menés à l'échelle d'une entreprise, ils relèvent de l'impôt sur les bénéfices.",
        "Staking, mining and airdrops received by an individual are not taxed; carried on as a business they fall under the profits tax.",
      ),
      refs: [REFS.it],
    },
    losses: {
      offsetWithinYear: false,
      carryForwardYears: 0,
      note: t("Sans imposition des gains, la question du report des pertes ne se pose pas pour un particulier.", "With no taxation of gains, loss carry-forward does not arise for an individual."),
    },
  },
  company: {
    framework: t("IFRS", "IFRS", "IFRS"),
    chart: IFRS_GENERIC,
    assetAccountWidth: 2,
    auditFile: "CSV",
    auditFileNote: t(
      "Aucun fichier des écritures normalisé n'est exigé. Les registres se conservent dix ans et se produisent sur demande de la General Tax Authority.",
      "No standardised audit file is required; records are kept for ten years and produced on request.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Coût diminué des dépréciations en IFRS, sauf pour un négociant appliquant l'évaluation à la juste valeur diminuée des coûts de vente.",
      "Cost less impairment under IFRS, except for a broker-trader measuring at fair value less costs to sell.",
    ),
    costMethods: ["AVERAGE", "FIFO"],
    corporateTax: [
      { label: t("Impôt sur les bénéfices — taux général", "Income tax on profits — general rate"), rate: "0.10" },
    ],
    refs: [REFS.it, REFS.qfc],
  },
  forms: [],
  dac8: {
    inScope: false,
    note: t(
      "DAC8 est une directive de l'Union et ne s'applique pas au Qatar. Un résident qatari détenant des avoirs auprès d'un prestataire établi dans l'Union sera néanmoins déclaré par celui-ci.",
      "DAC8 is an EU directive and does not apply to Qatar; a resident holding assets with an EU provider will still be reported by it.",
    ),
  },
  assumptions: [
    t(
      "Le riyal qatari est rattaché au dollar au cours de 3,64 QAR pour un dollar. Les valorisations passent par ce cours et par le taux de référence euro-dollar de la BCE.",
      "The Qatari riyal is pegged at QAR 3.64 to the dollar; valuations go through that peg and the ECB euro-dollar reference rate.",
    ),
    t(
      "La frontière entre la gestion d'un patrimoine privé et une activité exercée au Qatar n'est pas définie par un texte propre aux crypto-actifs : elle s'apprécie selon les critères généraux de l'activité, que l'application ne tranche pas.",
      "The line between managing private wealth and carrying on an activity in Qatar rests on the general criteria, which the app does not decide.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
