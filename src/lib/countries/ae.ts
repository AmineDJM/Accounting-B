import { gainsEngine } from "@/lib/engine/tax/gains";
import { IFRS_GENERIC } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * United Arab Emirates.
 *
 * There is no personal income tax, but that is a conclusion and not a
 * starting point. Since June 2023 a natural person is within corporate tax
 * where the turnover of their business activities exceeds AED 1,000,000 in a
 * calendar year — unless the activity is "Personal Investment", defined as an
 * investment activity conducted for one's own account that neither goes
 * through, nor requires, a licence, and that is not a commercial business under
 * the Commercial Transactions Law. A resident who trades intensively enough to
 * be carrying on a commercial business is therefore not automatically outside
 * the tax, and that is the question this pack puts in front of the user.
 */
const REFS = {
  ct: { jurisdiction: "AE" as const, code: "Federal Decree-Law No. 47 of 2022, art. 3 and 11(6)", title: "Corporate tax: 0 % up to AED 375,000 of taxable income, 9 % above; natural persons taxed only on business activities", url: "https://tax.gov.ae/en/legislation/corporate.tax.aspx", asOf: "2023-06-01" },
  cd49: { jurisdiction: "AE" as const, code: "Cabinet Decision No. 49 of 2023, art. 1 and 2", title: "Seuil de chiffre d'affaires de 1 000 000 AED ; exclusion du salaire, des revenus d'investissement personnel et des revenus immobiliers", url: "https://mof.gov.ae/wp-content/uploads/2023/05/Cabinet-Decision-No.-49-of-2023.pdf", asOf: "2023-06-01" },
  ctl50: { jurisdiction: "AE" as const, code: "Federal Decree-Law No. 50 of 2022 (Commercial Transactions Law)", title: "Définition de l'activité commerciale, à laquelle renvoie la notion d'investissement personnel", asOf: "2023-01-02" },
  md73: { jurisdiction: "AE" as const, code: "Ministerial Decision No. 73 of 2023", title: "Small Business Relief : chiffre d'affaires ne dépassant pas 3 000 000 AED", asOf: "2023-04-06" },
  cd100: { jurisdiction: "AE" as const, code: "Cabinet Decision No. 100 of 2023", title: "Qualifying Income d'une Qualifying Free Zone Person imposée à 0 %", asOf: "2023-06-01" },
  md229: { jurisdiction: "AE" as const, code: "Ministerial Decision No. 229 of 2025", title: "Activités qualifiantes et exclues des personnes de zone franche", asOf: "2025-01-01" },
  vat: { jurisdiction: "AE" as const, code: "Cabinet Decision No. 52 of 2017 (Executive Regulation of Federal Decree-Law No. 8 of 2017), art. 42(2)(k)(l)(m) et 42(3)(a), tel que modifié par Cabinet Decision No. 100 of 2024", title: "Le transfert de propriété d'actifs virtuels, leur conversion et leur conservation sont des services financiers exonérés lorsqu'ils ne sont pas rémunérés par une commission explicite", url: "https://tax.gov.ae/en/legislation/vat.aspx", asOf: "2024-11-15" },
  mad114: { jurisdiction: "AE" as const, code: "Ministerial Decision No. 114 of 2023", title: "Normes comptables applicables : IFRS, ou IFRS pour PME en deçà d'un seuil de chiffre d'affaires", asOf: "2023-05-30" },
  residency: { jurisdiction: "AE" as const, code: "Cabinet Decision No. 85 of 2022", title: "Critères de résidence fiscale d'une personne physique : 183 jours, ou 90 jours pour un ressortissant ou un résident disposant d'un logement permanent ou d'une activité", asOf: "2023-03-01" },
  vara: { jurisdiction: "AE" as const, code: "Dubai Law No. 4 of 2022 (VARA) et Cabinet Decision No. 111 of 2022 (SCA)", title: "Régulation des actifs virtuels à Dubaï et au niveau fédéral ; ADGM et DIFC disposent de leurs propres régimes", asOf: "2023-01-01" },
};

const NO_TAX = t(
  "Les Émirats arabes unis n'imposent pas le revenu des personnes physiques. Le résultat de chaque cession est calculé et tracé, mais aucun impôt n'est dû à ce titre par un particulier qui gère son patrimoine pour son propre compte.",
  "The United Arab Emirates do not tax personal income. Every disposal is computed and traced, but a natural person managing their own wealth owes no tax on it.",
);

export const AE: CountryPack = {
  code: "AE",
  name: t("Émirats arabes unis", "United Arab Emirates", "الإمارات العربية المتحدة"),
  flag: "🇦🇪",
  baseCurrency: "AED",
  alternativeCurrencies: ["USD", "EUR"],
  timezone: "Asia/Dubai",
  locale: "en-AE",
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
        "L'absence d'impôt vise l'« investissement personnel » : une activité d'investissement menée pour son propre compte, qui ne passe pas par une licence et n'en exige pas, et qui ne constitue pas une activité commerciale au sens du décret-loi fédéral n° 50 de 2022. Un négoce mené comme une entreprise sort de cette définition.",
        "The exemption covers Personal Investment: an investment activity for one's own account that neither goes through nor requires a licence and is not a commercial business under Federal Decree-Law No. 50 of 2022.",
      ),
      t(
        "Hors investissement personnel, une personne physique entre dans l'impôt sur les sociétés dès que le chiffre d'affaires de ses activités dépasse 1 000 000 AED sur une année civile, au taux de 0 % jusqu'à 375 000 AED de bénéfice imposable puis 9 %.",
        "Outside personal investment, a natural person enters corporate tax once the turnover of their activities exceeds AED 1,000,000 in a calendar year, at 0 % up to AED 375,000 of taxable income and 9 % above.",
      ),
      t(
        "Le transfert de propriété d'actifs virtuels, leur conversion et leur conservation sont des services financiers exonérés de TVA depuis le 1er janvier 2018 par effet rétroactif, lorsqu'ils ne sont pas rémunérés par une commission explicite. Une entreprise qui a facturé de la TVA sur ces opérations doit régulariser.",
        "Transferring ownership of virtual assets, converting them and keeping them are VAT-exempt financial services with retroactive effect from 1 January 2018, where not remunerated by an explicit fee.",
      ),
      t(
        "Rien n'exonère des obligations du pays de départ : un résident récent reste imposable chez lui sur la période antérieure, et plusieurs États d'Europe taxent la perte de résidence comme une cession. Conservez la preuve de la date de transfert de résidence et le certificat de résidence fiscale.",
        "Nothing here displaces the departure country's rules: several European States tax the loss of residence as a disposal. Keep the evidence of the date of transfer and the tax residency certificate.",
      ),
    ],
    years: { 2023: { notes: [NO_TAX] } },
    income: {
      taxedAtReceipt: false,
      acquisitionCost: "MARKET",
      category: t("Revenus en jetons — hors champ de l'impôt sur le revenu", "Token income — outside the scope of income tax"),
      note: t(
        "Le staking, le minage et les airdrops reçus par un particulier ne sont pas imposés. Menés à l'échelle d'une entreprise, notamment le minage, ils relèvent en revanche de l'impôt sur les sociétés et du seuil de 1 000 000 AED.",
        "Staking, mining and airdrops received by an individual are not taxed; carried on as a business, mining in particular, they fall under corporate tax and the AED 1,000,000 threshold.",
      ),
      refs: [REFS.cd49],
    },
    losses: {
      offsetWithinYear: false,
      carryForwardYears: 0,
      note: t("Sans imposition des gains, la question du report des pertes ne se pose pas pour un particulier.", "With no taxation of gains, loss carry-forward does not arise for an individual."),
    },
  },
  company: {
    framework: t("IFRS, ou IFRS pour PME en deçà du seuil de chiffre d'affaires fixé par le ministère des Finances", "IFRS, or IFRS for SMEs below the revenue threshold set by the Ministry of Finance", "IFRS / IFRS for SMEs"),
    chart: IFRS_GENERIC,
    assetAccountWidth: 2,
    auditFile: "CSV",
    auditFileNote: t(
      "Aucun fichier des écritures normalisé n'est exigé. Les registres comptables et les pièces se conservent sept ans à compter de la fin de la période d'imposition et doivent être produits sur demande de la Federal Tax Authority.",
      "No standardised audit file is required; records are kept for seven years from the end of the tax period and produced on request.",
    ),
    closingValuation: "FAIR_VALUE_PL",
    closingValuationNote: t(
      "En IFRS, un crypto-actif détenu à des fins ordinaires est une immobilisation incorporelle ou un stock de négociant selon l'activité ; l'option pour la juste valeur par résultat prévue par la loi sur l'impôt sur les sociétés doit être exercée lors de la première période et est irrévocable.",
      "Under IFRS a crypto-asset is an intangible asset or broker-trader inventory depending on the activity; the realisation-basis election under the corporate tax law is made in the first period and is irrevocable.",
    ),
    costMethods: ["AVERAGE", "FIFO"],
    corporateTax: [
      { label: t("Impôt sur les sociétés — jusqu'à 375 000 AED de bénéfice imposable", "Corporate tax — up to AED 375,000 of taxable income"), rate: "0" },
      { label: t("Impôt sur les sociétés — au-delà", "Corporate tax — above"), rate: "0.09" },
      { label: t("Qualifying Free Zone Person sur le Qualifying Income", "Qualifying Free Zone Person on Qualifying Income"), rate: "0", note: t("Sous condition de substance adéquate et d'activités qualifiantes ; une activité sur actifs virtuels n'est pas qualifiante par elle-même.", "Subject to adequate substance and qualifying activities; a virtual-asset activity is not qualifying in itself.") },
    ],
    refs: [REFS.ct, REFS.md73, REFS.cd100, REFS.md229, REFS.mad114],
  },
  forms: [],
  dac8: {
    inScope: false,
    note: t(
      "DAC8 est une directive de l'Union et ne s'applique pas aux Émirats. Le rapprochement reste utile dans deux cas : un résident des Émirats détenant des avoirs auprès d'un prestataire établi dans l'Union sera déclaré par celui-ci à son administration, et le cadre CARF de l'OCDE conduit à des échanges au-delà de l'Union.",
      "DAC8 is an EU directive and does not apply to the Emirates. The reconciliation still matters where a UAE resident holds assets with an EU provider, and because the OECD CARF leads to exchanges beyond the Union.",
    ),
  },
  assumptions: [
    t(
      "L'application ne qualifie pas l'activité : elle rappelle le critère de l'investissement personnel et le seuil de 1 000 000 AED, et fournit le nombre d'opérations et les volumes qui permettent de l'apprécier.",
      "The app does not qualify the activity: it records the personal-investment test and the AED 1,000,000 threshold and supplies the transaction counts and volumes needed to assess it.",
    ),
    t(
      "Le dirham est rattaché au dollar au cours de 3,6725 AED pour un dollar. Les valorisations en dirhams passent par ce cours et par le taux de référence euro-dollar de la BCE ; la source est indiquée sur chaque ligne.",
      "The dirham is pegged at AED 3.6725 to the dollar; valuations in dirhams go through that peg and the ECB euro-dollar reference rate.",
    ),
    t(
      "La résidence fiscale d'une personne physique s'apprécie selon la décision n° 85 de 2022 : 183 jours de présence, ou 90 jours pour un ressortissant ou un résident disposant d'un logement permanent ou d'une activité dans l'État. Le certificat de résidence fiscale se demande à la Federal Tax Authority.",
      "Personal tax residence follows Cabinet Decision No. 85 of 2022: 183 days, or 90 days for a national or resident with a permanent home or activity in the State.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
