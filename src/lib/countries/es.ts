import { gainsEngine } from "@/lib/engine/tax/gains";
import { PGC_ES } from "./charts";
import { t, type CountryPack } from "./types";

const REFS = {
  art33: { jurisdiction: "ES" as const, code: "Ley 35/2006 (LIRPF), arts. 33, 34 y 35", title: "Ganancias y pérdidas patrimoniales, valor de transmisión y de adquisición", url: "https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764", asOf: "2026-01-01" },
  art37h: { jurisdiction: "ES" as const, code: "LIRPF, art. 37.1.h)", title: "Permuta — el intercambio de una moneda virtual por otra es una alteración patrimonial gravada", asOf: "2026-01-01" },
  art46: { jurisdiction: "ES" as const, code: "LIRPF, arts. 46, 66 y 76", title: "Base del ahorro y escalas estatal y autonómica", asOf: "2026-01-01" },
  art49: { jurisdiction: "ES" as const, code: "LIRPF, art. 49", title: "Integración y compensación en la base del ahorro, límite del 25 % y arrastre de cuatro años", asOf: "2026-01-01" },
  art25: { jurisdiction: "ES" as const, code: "LIRPF, art. 25.2", title: "Rendimientos del capital mobiliario — staking y préstamo de criptoactivos", asOf: "2026-01-01" },
  fifo: { jurisdiction: "ES" as const, code: "DGT, consultas V0999-18, V0975-22, V2520-22, V0525-25", title: "Criterio FIFO por tipo de moneda virtual, agregando todas las plataformas", url: "https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V0999-18", asOf: "2025-01-01" },
  m721: { jurisdiction: "ES" as const, code: "Orden HFP/886/2023 y art. 42 quater RGAT", title: "Modelo 721 — criptomonedas situadas en el extranjero por encima de 50 000 €", url: "https://www.boe.es/buscar/act.php?id=BOE-A-2023-17429", asOf: "2024-12-26" },
  icac: { jurisdiction: "ES" as const, code: "ICAC, BOICAC n.º 120/2019, consulta 4", title: "Existencias (grupo 3) si se destinan a la venta, inmovilizado intangible (grupo 2) en otro caso", url: "https://www.icac.gob.es/sites/default/files/2020-11/BOICAC_120_1219_4.PDF", asOf: "2019-12-01" },
  lis: { jurisdiction: "ES" as const, code: "Ley 27/2014 (LIS), art. 29 y DT 44ª", title: "Tipos del impuesto sobre sociedades", asOf: "2026-01-01" },
};

const BRACKETS = [
  { upTo: "6000", rate: "0.19" },
  { upTo: "50000", rate: "0.21" },
  { upTo: "200000", rate: "0.23" },
  { upTo: "300000", rate: "0.27" },
  { upTo: null, rate: "0.30" },
];

const YEAR = {
  brackets: BRACKETS,
  notes: [
    t(
      "L'escalier de la base de l'épargne s'applique à l'ensemble des revenus de l'épargne du foyer : appliqué ici aux seuls gains sur cryptoactifs, il sous-estime le taux réel si vous percevez par ailleurs des dividendes, intérêts ou plus-values mobilières.",
      "The savings-base scale applies to all of the household's savings income: applied here to crypto gains alone it understates the real rate if you also receive dividends, interest or securities gains.",
    ),
    t(
      "L'échange d'un cryptoactif contre un autre est une permuta imposable : l'Espagne ne connaît pas le sursis d'imposition français ou portugais.",
      "A swap between crypto-assets is a taxable permuta: Spain has no rollover.",
    ),
  ],
};

export const ES: CountryPack = {
  code: "ES",
  name: t("Espagne", "Spain", "España"),
  flag: "🇪🇸",
  baseCurrency: "EUR",
  timezone: "Europe/Madrid",
  locale: "es-ES",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    taxableDisposals: ["FIAT", "CRYPTO", "GOODS", "FEE"],
    costMethod: "FIFO",
    costMethodLabel: t("FIFO par actif, toutes plateformes confondues", "FIFO per asset, pooled across platforms", "Criterio FIFO"),
    perWallet: false,
    deductFees: true,
    capitaliseAcquisitionFees: true,
    years: { 2025: YEAR, 2026: YEAR },
    income: {
      taxedAtReceipt: true,
      acquisitionCost: "MARKET",
      category: t("Rendements du capital mobilier — art. 25.2 LIRPF", "Investment income — art. 25.2 LIRPF", "Rendimientos del capital mobiliario"),
      flatRate: "0.19",
      note: t(
        "Le staking et le prêt sont imposés dans la base de l'épargne à leur valeur en euros à la réception, sans déduction de frais et sans retenue à la source lorsque le payeur n'est pas espagnol. Les airdrops relèvent en revanche de la base générale.",
        "Staking and lending are taxed in the savings base at their euro value on receipt, gross and without withholding where the payer is not Spanish. Airdrops fall in the general base instead.",
      ),
      refs: [REFS.art25],
      byKind: {
        AIRDROP: { category: t("Gain patrimonial ne résultant pas d'une transmission — base générale", "Capital gain not arising from a transfer — general base", "Ganancia patrimonial no derivada de transmisión") },
        MINING: { category: t("Activité économique — art. 27 LIRPF, base générale", "Business activity — art. 27 LIRPF, general base", "Actividad económica") },
      },
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: 4,
      note: t(
        "Les pertes se compensent d'abord avec les gains de la base de l'épargne, puis, dans la limite de 25 % de leur solde positif, avec les rendements du capital mobilier ; le reliquat se reporte sur quatre ans et doit être imputé au maximum chaque année.",
        "Losses first offset savings-base gains, then up to 25 % of positive investment income; the remainder carries forward four years and must be used to the maximum each year.",
      ),
      refs: [REFS.art49],
    },
  },
  company: {
    framework: t("Plan General de Contabilidad (RD 1514/2007)", "Spanish GAAP", "Plan General de Contabilidad"),
    chart: PGC_ES,
    auditFile: "CSV",
    auditFileNote: t(
      "L'Espagne n'impose pas de fichier d'audit comptable : le libro diario et le libro de inventarios y cuentas anuales sont légalisés par voie électronique au Registro Mercantil dans les quatre mois de la clôture.",
      "Spain has no mandatory accounting audit file: the journal and inventory books are legalised electronically at the Commercial Register within four months of year end.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Coût historique et dépréciation : valeur nette de réalisation si inférieure pour les cryptoactifs classés en stocks (NRV 10ª), test de dépréciation pour ceux classés en immobilisations incorporelles (NRV 5ª et 6ª).",
      "Historical cost and impairment: net realisable value for crypto classified as inventories, impairment testing for those classified as intangibles.",
    ),
    costMethods: ["FIFO", "AVERAGE"],
    corporateTax: [
      { label: t("Impôt sur les sociétés — taux général", "Corporate income tax — general rate"), rate: "0.25" },
      { label: t("Microentreprises (chiffre d'affaires < 1 M€) — première tranche de 50 000 €", "Micro-enterprises — first €50,000"), rate: "0.19" },
      { label: t("Entités de dimension réduite", "Small entities"), rate: "0.23" },
    ],
    refs: [REFS.icac, REFS.lis],
  },
  forms: [
    {
      name: "Modelo 100",
      label: t("Déclaration annuelle de l'impôt sur le revenu", "Annual income tax return"),
      deadline: t("Campagne de la Renta, d'avril à juin de l'année suivante.", "Renta campaign, April to June of the following year."),
      boxes: [
        { id: "GROSS_PROCEEDS", box: "1804", label: t("Valeur de transmission", "Transfer value"), note: t("Numéros de cases relevés dans la documentation professionnelle : à vérifier sur l'ordre approuvant le modèle de l'année.", "Box numbers from professional sources: check against the order approving each year's form.") },
        { id: "COST", box: "1805", label: t("Valeur d'acquisition", "Acquisition value") },
        { id: "NET_GAIN", box: "1806", label: t("Gain ou perte patrimoniale", "Capital gain or loss") },
      ],
    },
    {
      name: "Modelo 721",
      label: t("Déclaration informative sur les monnaies virtuelles situées à l'étranger", "Information return on virtual currencies held abroad"),
      deadline: t("Du 1er janvier au 31 mars de l'année suivante.", "1 January to 31 March of the following year."),
      boxes: [{ id: "BALANCE", box: "—", label: t("Solde au 31 décembre, si l'ensemble des avoirs à l'étranger dépasse 50 000 €", "Balance at 31 December, where foreign holdings exceed €50,000") }],
    },
  ],
  foreignAccounts: {
    required: true,
    form: "Modelo 721",
    label: t("Monnaies virtuelles détenues à l'étranger", "Virtual currencies held abroad"),
    threshold: "50000",
    penalty: t("Régime général de sanctions des obligations d'information (arts. 198 et 199 LGT).", "General information-obligation penalty regime (arts. 198-199 LGT)."),
    refs: [REFS.m721],
  },
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "La transposition espagnole n'était pas encore publiée en mars 2026 : le projet d'arrêté crée les modèles 042, 172, 175 et adapte le 721. Le modèle 172 déclare en outre les soldes, ce que la norme européenne ne prévoit pas.",
      "Spanish transposition was still pending in March 2026: the draft order creates forms 042, 172 and 175. Form 172 also reports balances, which the European standard does not.",
    ),
  },
  assumptions: [
    t(
      "La méthode FIFO appliquée aux cryptoactifs repose sur la doctrine administrative et non sur la loi : l'article 37.2 LIRPF ne vise que les valeurs homogènes.",
      "FIFO for crypto rests on administrative doctrine, not statute: art. 37.2 LIRPF only covers homogeneous securities.",
    ),
    t(
      "La règle anti-lavage de l'article 33.5 LIRPF, écrite pour les titres, n'a pas été étendue aux cryptoactifs par une consultation contraignante : le rachat d'un actif cédé à perte n'est donc pas neutralisé par ce calcul.",
      "The anti-wash rule of art. 33.5 LIRPF has not been extended to crypto by a binding ruling, so a repurchase is not neutralised here.",
    ),
    t(
      "Le PGC ne prévoit aucun numéro de compte dédié aux cryptoactifs : le plan proposé est une convention à valider avec le cabinet.",
      "The Spanish chart has no dedicated crypto account: the proposed numbering is a convention to agree with the practice.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
