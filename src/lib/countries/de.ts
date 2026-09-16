import Decimal from "decimal.js";
import { gainsEngine } from "@/lib/engine/tax/gains";
import { SKR04_DE } from "./charts-de";
import { t, type CountryPack } from "./types";

const REFS = {
  bmf: { jurisdiction: "DE" as const, code: "BMF-Schreiben vom 06.03.2025, IV C 1 – S 2256/00042/064/043", title: "Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte", url: "https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte-bmf-schreiben.pdf", asOf: "2025-03-06" },
  p23: { jurisdiction: "DE" as const, code: "§ 23 Abs. 1 Satz 1 Nr. 2 EStG", title: "Private Veräußerungsgeschäfte — Jahresfrist", url: "https://www.gesetze-im-internet.de/estg/__23.html", asOf: "2026-01-01" },
  p23freigrenze: { jurisdiction: "DE" as const, code: "§ 23 Abs. 3 Satz 5 EStG", title: "Freigrenze von 1 000 € für den Gesamtgewinn privater Veräußerungsgeschäfte", url: "https://www.gesetze-im-internet.de/estg/__23.html", asOf: "2026-01-01" },
  p23loss: { jurisdiction: "DE" as const, code: "§ 23 Abs. 3 Sätze 7 und 8 EStG", title: "Verlustverrechnung, Rücktrag und unbefristeter Vortrag innerhalb des § 23", asOf: "2026-01-01" },
  p22: { jurisdiction: "DE" as const, code: "§ 22 Nr. 3 EStG", title: "Einkünfte aus Leistungen — Staking, Lending, Airdrops; Freigrenze 256 €", url: "https://www.gesetze-im-internet.de/estg/__22.html", asOf: "2026-01-01" },
  p32a: { jurisdiction: "DE" as const, code: "§ 32a Abs. 1 EStG (Fassung ab VZ 2026)", title: "Einkommensteuertarif", url: "https://www.gesetze-im-internet.de/estg/__32a.html", asOf: "2026-01-01" },
  solz: { jurisdiction: "DE" as const, code: "§ 3 Abs. 3 und § 4 SolZG 1995", title: "Solidaritätszuschlag — Freigrenze 20 350 € / 40 700 €", url: "https://www.gesetze-im-internet.de/solzg_1995/__3.html", asOf: "2026-01-01" },
  hgb: { jurisdiction: "DE" as const, code: "§ 266 Abs. 2 A.III / B.II.4, § 253 Abs. 3–5, § 256 HGB", title: "Ausweis und Bewertung von Kryptowerten im Jahresabschluss", url: "https://www.gesetze-im-internet.de/hgb/", asOf: "2026-01-01" },
  kstg: { jurisdiction: "DE" as const, code: "§ 23 Abs. 1 KStG; §§ 11, 16 GewStG", title: "Körperschaftsteuer 15 % und Gewerbesteuer", asOf: "2026-01-01" },
  ksttg: { jurisdiction: "DE" as const, code: "Kryptowerte-Steuertransparenzgesetz (KStTG) vom 22.12.2025, BGBl. 2025 I Nr. 352", title: "Umsetzung von DAC8 — Meldepflichten der Anbieter ab 2026", url: "https://www.gesetze-im-internet.de/ksttg/", asOf: "2025-12-22" },
  bfh: { jurisdiction: "DE" as const, code: "BFH, Urteil vom 14.02.2023, IX R 3/22", title: "Kryptowerte sind « andere Wirtschaftsgüter » im Sinne des § 23 EStG", asOf: "2023-02-14" },
};

/** Einkommensteuertarif § 32a Abs. 1 EStG in der ab VZ 2026 geltenden Fassung. */
export function germanTariff2026(zvE: Decimal): Decimal {
  const x = zvE.toDecimalPlaces(0, Decimal.ROUND_DOWN);
  if (x.lte(12348)) return new Decimal(0);
  if (x.lte(17799)) {
    const y = x.minus(12348).div(10000);
    return y.mul(914.51).plus(1400).mul(y).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  }
  if (x.lte(69878)) {
    const z = x.minus(17799).div(10000);
    return z.mul(173.1).plus(2397).mul(z).plus(1034.87).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  }
  if (x.lte(277825)) return x.mul(0.42).minus(11135.63).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  return x.mul(0.45).minus(19470.38).toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

/** Solidaritätszuschlag mit Freigrenze und Milderungszone (§§ 3, 4 SolZG 1995). */
export function solidaritySurcharge(incomeTax: Decimal, joint = false): Decimal {
  const threshold = new Decimal(joint ? 40700 : 20350);
  if (incomeTax.lte(threshold)) return new Decimal(0);
  return Decimal.min(incomeTax.mul(0.055), incomeTax.minus(threshold).mul(0.119));
}

/**
 * Germany taxes a private crypto gain at the taxpayer's marginal rate, so the
 * charge cannot be stated without the rest of their income. When the other
 * taxable income is supplied, the estimate is exact: the tariff applied to
 * income including the gain, less the tariff applied without it, plus the
 * solidarity surcharge and, if declared, church tax.
 */
const estimator = (base: string, options: Record<string, string | number | boolean>) => {
  const other = options.otherTaxableIncome;
  if (other === undefined || other === null || other === "") return null;
  const joint = Boolean(options.jointAssessment);
  const otherIncome = new Decimal(String(other));
  const gain = new Decimal(base);
  const taxWith = germanTariff2026(otherIncome.plus(gain));
  const taxWithout = germanTariff2026(otherIncome);
  const income = taxWith.minus(taxWithout);
  const solz = solidaritySurcharge(taxWith, joint).minus(solidaritySurcharge(taxWithout, joint));
  const churchRate = options.churchTaxRate ? new Decimal(String(options.churchTaxRate)) : new Decimal(0);
  const church = income.mul(churchRate);
  const components = [
    { label: t("Einkommensteuer (Grenzsteuersatz)", "Income tax at the marginal rate"), amount: income.toString(), rate: gain.isZero() ? undefined : income.div(gain).toFixed(4) },
    { label: t("Solidaritätszuschlag", "Solidarity surcharge"), amount: solz.toString(), rate: "0.055" },
  ];
  if (church.gt(0)) components.push({ label: t("Kirchensteuer", "Church tax"), amount: church.toString(), rate: churchRate.toString() });
  return {
    components,
    note: t(
      `Estimation calculée par différence de barème : impôt sur ${otherIncome.plus(gain).toFixed(0)} € moins impôt sur ${otherIncome.toFixed(0)} €.`,
      `Estimated as the difference between the tariff on €${otherIncome.plus(gain).toFixed(0)} and the tariff on €${otherIncome.toFixed(0)}.`,
    ),
  };
};

const YEAR = {
  allowance: { amount: "1000", kind: "FREIGRENZE" as const, label: t("Freigrenze de 1 000 € sur le gain total des cessions privées", "€1,000 Freigrenze on the total gain from private disposals"), refs: [REFS.p23freigrenze] },
  estimator,
  noEstimateNote: t(
    "Le gain est imposé au barème progressif : renseignez vos autres revenus imposables dans les options pour obtenir une estimation.",
    "The gain is taxed at the progressive tariff: enter your other taxable income to get an estimate.",
  ),
  notes: [
    t(
      "Seuil et non abattement : un gain total de 1 000 € ou plus rend la totalité imposable, y compris les plus-values sur d'autres biens privés (or, objets de collection).",
      "A threshold, not an allowance: a total gain of €1,000 or more makes the whole amount taxable, including gains on other private assets.",
    ),
  ],
};

export const DE: CountryPack = {
  code: "DE",
  name: t("Allemagne", "Germany", "Deutschland"),
  flag: "🇩🇪",
  baseCurrency: "EUR",
  timezone: "Europe/Berlin",
  locale: "de-DE",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    taxableDisposals: ["FIAT", "CRYPTO", "GOODS", "FEE"],
    costMethod: "FIFO",
    costMethodLabel: t("FIFO par portefeuille (BMF, Rn. 61-62)", "Wallet-by-wallet FIFO", "FiFo, walletbezogen"),
    perWallet: true,
    exemptAfterYears: 1,
    exemptAfterDaysLabel: t("Détention de plus d'un an — § 23 EStG", "Held for more than one year — § 23 EStG", "Haltefrist von einem Jahr überschritten"),
    deductFees: true,
    capitaliseAcquisitionFees: true,
    years: { 2024: YEAR, 2026: YEAR },
    income: {
      taxedAtReceipt: true,
      acquisitionCost: "MARKET",
      category: t("Revenus de prestations — § 22 n° 3 EStG", "Income from services — § 22 No. 3 EStG", "Sonstige Einkünfte, § 22 Nr. 3 EStG"),
      allowance: { amount: "256", kind: "FREIGRENZE", label: t("Freigrenze de 256 € sur les revenus du § 22 n° 3", "€256 Freigrenze on § 22 No. 3 income"), refs: [REFS.p22] },
      note: t(
        "Staking, lending et airdrops rémunérant une prestation sont imposés à la réception au barème progressif ; les jetons reçus ouvrent une nouvelle période de détention d'un an.",
        "Staking, lending and airdrops rewarding a service are taxed on receipt at the progressive tariff; the tokens received start a fresh one-year holding period.",
      ),
      refs: [REFS.p22, REFS.bmf],
      byKind: {
        AIRDROP: { note: t("Un airdrop n'est imposable au titre du § 22 n° 3 que s'il rémunère une prestation ; à défaut il peut relever des droits de donation.", "An airdrop is only § 22 No. 3 income where it rewards a service; otherwise gift tax may apply.") },
        MINING: { category: t("Minage — § 22 n° 3 ou activité commerciale § 15 EStG", "Mining — § 22 No. 3 or business income § 15 EStG", "Mining — § 22 Nr. 3 oder § 15 EStG") },
      },
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: null,
      carryBack: true,
      note: t(
        "Les pertes ne s'imputent que sur des gains de cessions privées : report en arrière d'un an et report en avant illimité, après constatation formelle par l'administration.",
        "Losses offset private disposal gains only: one-year carry-back and unlimited carry-forward, after formal assessment.",
      ),
      refs: [REFS.p23loss],
    },
  },
  company: {
    framework: t("Droit comptable allemand (HGB), plan DATEV SKR04", "German GAAP (HGB), DATEV SKR04 chart", "HGB / SKR04"),
    chart: SKR04_DE,
    assetAccountWidth: 0,
    auditFile: "DATEV",
    auditFileNote: t(
      "Export DATEV « EXTF Buchungsstapel » (format 700, version 13), encodage Windows-1252, montants en euros sans signe avec indicateur S/H. DATEV ne gère pas les jetons comme une devise : les quantités figurent dans le libellé.",
      "DATEV EXTF booking batch export (format 700, version 13), Windows-1252, unsigned EUR amounts with a debit/credit flag.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Principe de valeur minimale : dépréciation obligatoire à la valeur de marché à la clôture pour l'actif circulant (§ 253 al. 4 HGB), seulement en cas de dépréciation durable pour l'actif immobilisé (§ 253 al. 3 HGB). La reprise est obligatoire dès que le motif disparaît, dans la limite du coût d'acquisition (§ 253 al. 5 HGB).",
      "Lower of cost or market: mandatory write-down for current assets, only for lasting impairment for fixed assets; write-back mandatory up to cost.",
    ),
    costMethods: ["FIFO", "AVERAGE"],
    corporateTax: [
      { label: t("Körperschaftsteuer", "Corporate income tax"), rate: "0.15" },
      { label: t("Solidaritätszuschlag sur l'impôt sur les sociétés", "Solidarity surcharge on corporate tax"), rate: "0.00825", note: t("5,5 % de l'impôt sur les sociétés, soit 0,825 point.", "5.5 % of the corporate tax, i.e. 0.825 points.") },
      { label: t("Gewerbesteuer (taux communal moyen ~400 %)", "Trade tax (average municipal multiplier ~400 %)"), rate: "0.14", note: t("3,5 % × taux communal ; minimum légal 200 %. Pas d'abattement de 24 500 € pour les sociétés de capitaux.", "3.5 % × municipal multiplier; statutory minimum 200 %.") },
    ],
    refs: [REFS.hgb, REFS.kstg, REFS.bmf],
  },
  forms: [
    {
      name: "Anlage SO",
      label: t("Annexe « Autres revenus » de la déclaration de revenus", "Other income annex to the income tax return"),
      deadline: t("31 juillet de l'année suivante ; fin février de la deuxième année suivante si un conseil fiscal dépose (§ 149 AO).", "31 July of the following year; end of February of the second following year if filed by a tax adviser."),
      boxes: [
        { id: "SECTION", box: "Zeile 45 (Kz 108)", label: t("Ouverture du bloc « Private Veräußerungsgeschäfte – Kryptowerte »", "Opens the crypto private-disposals block"), note: t("Numéros de lignes du millésime 2025, à revérifier sur le formulaire officiel 2026.", "Line numbers from the 2025 form, to be re-checked on the official 2026 version.") },
        { id: "NET_GAIN", box: "Gewinn/Verlust", label: t("Résultat des cessions privées de cryptoactifs", "Gain or loss on private crypto disposals") },
        { id: "INCOME", box: "Leistungen", label: t("Revenus au titre du § 22 n° 3 (staking, lending, airdrops)", "§ 22 No. 3 income (staking, lending, airdrops)") },
      ],
    },
    { name: "Anlage KAP", label: t("Annexe « Revenus de capitaux » — security tokens et dérivés sur cryptoactifs", "Capital income annex — security tokens and crypto derivatives"), boxes: [{ id: "DERIVATIVES", box: "—", label: t("Produits imposés au prélèvement forfaitaire de 25 %", "Income taxed at the 25 % flat rate") }] },
  ],
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "Loi de transparence fiscale des cryptoactifs (KStTG) du 22 décembre 2025 : obligations de vigilance dès 2026, déclaration au BZSt au plus tard le 31 juillet 2027, échange européen au 30 septembre 2027.",
      "The KStTG of 22 December 2025 applies due-diligence duties from 2026, reporting to the BZSt by 31 July 2027.",
    ),
  },
  assumptions: [
    t(
      "Le suivi des lots est effectué portefeuille par portefeuille, comme l'exige la « walletbezogene Betrachtung » du BMF : un transfert entre vos comptes conserve la date d'acquisition seulement si le compte de départ est importé.",
      "Lots are tracked per wallet, as the BMF requires: a transfer between your accounts keeps the acquisition date only if the source account is imported.",
    ),
    t(
      "Les NFT et la fourniture de liquidité (liquidity mining) sont expressément hors du champ de l'instruction du 6 mars 2025 : leur traitement retenu ici est celui du marché, non une position administrative.",
      "NFTs and liquidity mining are expressly outside the 6 March 2025 BMF letter: the treatment applied here is market practice, not an administrative position.",
    ),
    t(
      "Les dérivés sur cryptoactifs (futures, CFD, options) relèvent du § 20 EStG au taux forfaitaire de 25 % et ne sont pas traités par ce calcul.",
      "Crypto derivatives fall under § 20 EStG at the 25 % flat rate and are not covered by this computation.",
    ),
    t(
      "Un projet de réforme (avant-projet du BMF de septembre 2026) déplacerait les gains sur cryptoactifs vers le § 20 EStG à 25 % à compter de 2027, sans effet sur l'exercice 2026 et avec maintien des droits acquis sur les actifs détenus avant 2027.",
      "A September 2026 BMF draft would move crypto gains to § 20 EStG at 25 % from 2027, with grandfathering for assets acquired before 2027.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
