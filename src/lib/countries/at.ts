import { gainsEngine } from "@/lib/engine/tax/gains";
import { EKR_AT } from "./charts-de";
import { t, type CountryPack } from "./types";

const REFS = {
  p27b: { jurisdiction: "AT" as const, code: "§ 27b EStG 1988", title: "Einkünfte aus Kryptowährungen — laufende Einkünfte et réalisation", url: "https://ris.bka.gv.at/eli/bgbl/1988/400/P27b/NOR40254900", asOf: "2023-07-22" },
  p27a: { jurisdiction: "AT" as const, code: "§ 27a Abs. 1 Z 2, Abs. 4 Z 1/2/3a/5, Abs. 5, Abs. 6 EStG 1988", title: "Taux spécial de 27,5 %, prix moyen glissant, coût nul du staking et des airdrops", asOf: "2026-01-01" },
  vo: { jurisdiction: "AT" as const, code: "KryptowährungsVO, BGBl. II Nr. 455/2022", title: "Prix moyen glissant par adresse ou portefeuille et ordre de cession", url: "https://ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2022_II_455/BGBLA_2022_II_455.html", asOf: "2022-12-13" },
  estr: { jurisdiction: "AT" as const, code: "EStR 2000, Wartungserlass 2026 (BMF 21.04.2026, BMF-AV Nr. 76/2026), Rz 803b, 6103l, 6178ab, 6178t", title: "Fusion de jetons, ordre de cession, contreparties accessoires", asOf: "2026-04-21" },
  p27_8: { jurisdiction: "AT" as const, code: "§ 27 Abs. 8 EStG 1988", title: "Compensation des pertes sur capitaux mobiliers — pas de report", asOf: "2026-01-01" },
  p31: { jurisdiction: "AT" as const, code: "§ 31 EStG 1988", title: "Spekulationsgeschäfte — NFT, franchise de 440 €, pertes non compensables", asOf: "2026-01-01" },
  ugb: { jurisdiction: "AT" as const, code: "§§ 198 Abs. 2, 203, 204 Abs. 2, 207, 208 UGB", title: "Classement et évaluation, obligation de réévaluation", asOf: "2026-01-01" },
  kstg: { jurisdiction: "AT" as const, code: "§ 22 Abs. 1 KStG 1988", title: "Körperschaftsteuer 23 %", asOf: "2024-01-01" },
  mpfg: { jurisdiction: "AT" as const, code: "Krypto-Meldepflichtgesetz, BGBl. I Nr. 96/2025", title: "Transposition de DAC8, applicable depuis le 1er janvier 2026", asOf: "2025-12-23" },
};

const YEAR = {
  flatRate: "0.275",
  components: [{ label: t("Taux spécial sur les revenus de cryptoactifs", "Special rate on crypto income", "Besonderer Steuersatz § 27a Abs. 1 Z 2"), rate: "0.275" }],
  notes: [
    t(
      "Aucune franchise n'existe pour les revenus de cryptoactifs : le premier euro de gain est imposé. La franchise de 440 € ne vise que les opérations spéculatives du § 31 (NFT notamment).",
      "There is no allowance for crypto income: the first euro is taxed. The €440 allowance only covers § 31 speculative transactions such as NFTs.",
    ),
    t(
      "L'option pour le barème (Regelbesteuerung) est globale et porte sur l'ensemble des revenus soumis au taux spécial.",
      "The option for the ordinary tariff is all-or-nothing across every item taxed at the special rate.",
    ),
  ],
};

export const AT: CountryPack = {
  code: "AT",
  name: t("Autriche", "Austria", "Österreich"),
  flag: "🇦🇹",
  baseCurrency: "EUR",
  timezone: "Europe/Vienna",
  locale: "de-AT",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    // An exchange between crypto-currencies is not a realisation (§ 27b(3) Z 2);
    // fees related to such an exchange are expressly disregarded.
    taxableDisposals: ["FIAT", "GOODS"],
    costMethod: "AVERAGE",
    costMethodLabel: t("Prix moyen glissant par portefeuille (§ 27a al. 4 Z 3a)", "Moving average price per wallet", "Gleitender Durchschnittspreis"),
    perWallet: true,
    legacyBefore: "2021-03-01",
    legacyTreatment: "EXEMPT",
    legacyLabel: t(
      "Altvermögen : jetons acquis avant le 1er mars 2021, hors du régime du § 27b et exonérés",
      "Legacy holdings acquired before 1 March 2021 stay outside § 27b and are exempt",
      "Altvermögen (Anschaffung vor dem 1. März 2021)",
    ),
    deductFees: false,
    capitaliseAcquisitionFees: false,
    deferredSwap: {
      rollsOverCost: true,
      carriesAcquisitionDate: true,
      note: t(
        "L'échange d'une cryptomonnaie contre une autre n'est pas une réalisation : le prix d'acquisition et, avec lui, le statut d'Altvermögen sont reportés sur le jeton reçu.",
        "A swap between crypto-currencies is not a realisation: the acquisition cost, and with it the legacy status, rolls over to the token received.",
      ),
    },
    flagDisposals: [
      {
        id: "at-nft-swap",
        matches: (_asset, counter) => Boolean(counter && ["NFT", "WBTC", "WETH", "STETH", "RETH"].includes(counter.toUpperCase())),
        message: t(
          "Échange vers un jeton qui n'est peut-être pas une « Kryptowährung » au sens du § 27b al. 4 (NFT, jeton emballé, dérivé de staking liquide) : la neutralité de l'échange ne s'applique alors pas et l'opération devient imposable. À faire confirmer.",
          "Swap into a token that may not be a crypto-currency within § 27b(4) (NFT, wrapped token, liquid staking derivative): the swap would then be a taxable realisation.",
        ),
      },
    ],
    years: { 2022: YEAR, 2026: YEAR },
    income: {
      taxedAtReceipt: false,
      acquisitionCost: "ZERO",
      category: t("Revenus de cryptoactifs — § 27b al. 2", "Crypto income — § 27b(2)", "Einkünfte aus Kryptowährungen"),
      flatRate: "0.275",
      note: t(
        "Le staking, les airdrops, les bounties et les hard forks ne sont pas imposés à la réception : les jetons reçus entrent pour un prix d'acquisition nul et la totalité du produit est imposée lors de la cession.",
        "Staking, airdrops, bounties and hard forks are not taxed on receipt: the tokens enter at nil cost and the whole proceeds are taxed on disposal.",
      ),
      refs: [REFS.p27b, REFS.p27a],
      byKind: {
        LENDING: {
          taxedAtReceipt: true,
          acquisitionCost: "MARKET",
          category: t("Rémunération de la mise à disposition — § 27b al. 2 Z 1", "Consideration for lending — § 27b(2) Z 1", "Entgelte für die Überlassung"),
          note: t("Imposé à 27,5 % au moment de l'encaissement ; le jeton reçu entre pour la valeur imposée.", "Taxed at 27.5 % on receipt; the token enters at the value taxed."),
        },
        MINING: {
          taxedAtReceipt: true,
          acquisitionCost: "MARKET",
          category: t("Minage et masternodes — § 27b al. 2 Z 2", "Mining and masternodes — § 27b(2) Z 2", "Einkünfte aus der Blockerstellung"),
        },
      },
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: 0,
      note: t(
        "Les pertes ne se compensent qu'au sein de l'année et des seuls revenus de capitaux soumis au taux spécial : aucun report sur les années suivantes. Le moment de la réalisation avant le 31 décembre est donc décisif.",
        "Losses offset only within the year and only against capital income taxed at the special rate: no carry-forward at all.",
      ),
      refs: [REFS.p27_8],
    },
  },
  company: {
    framework: t("Droit comptable autrichien (UGB), Einheitskontenrahmen KFS/BW 6", "Austrian GAAP (UGB), standard chart KFS/BW 6", "UGB / Einheitskontenrahmen"),
    chart: EKR_AT,
    assetAccountWidth: 0,
    auditFile: "DATEV",
    auditFileNote: t(
      "Les cabinets autrichiens utilisent BMD NTCS, RZL ou DATEV Österreich : confirmez l'interface attendue avant l'export. Le format proposé ici est le lot d'écritures DATEV.",
      "Austrian practices use BMD NTCS, RZL or DATEV Österreich: confirm the expected interface before exporting.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Principe de valeur minimale strict pour l'actif circulant (§ 207 UGB), atténué pour l'actif immobilisé (§ 204 al. 2 UGB). La reprise de valeur est obligatoire jusqu'au coût d'acquisition (§ 208 UGB).",
      "Strict lower of cost or market for current assets, mitigated for fixed assets; write-back mandatory up to cost.",
    ),
    costMethods: ["AVERAGE", "FIFO"],
    corporateTax: [{ label: t("Körperschaftsteuer", "Corporate income tax"), rate: "0.23", note: t("Impôt minimum de 500 € par an pour une GmbH, imputable sur les exercices ultérieurs.", "Minimum tax of €500 a year for a GmbH, creditable against later years.") }],
    refs: [REFS.ugb, REFS.kstg],
  },
  forms: [
    {
      name: "E 1kv",
      label: t("Annexe « revenus de capitaux » à la déclaration E 1", "Capital income annex to the E 1 return"),
      deadline: t("30 avril de l'année suivante sur papier, 30 juin via FinanzOnline ; 31 mars de la deuxième année suivante sous quota d'un conseil fiscal.", "30 April on paper, 30 June via FinanzOnline; 31 March of the second following year under a tax adviser's quota."),
      boxes: [
        { id: "NET_GAIN", box: "KZ 172", label: t("Revenus de cryptoactifs imposés à 27,5 %", "Crypto income taxed at 27.5 %") },
        { id: "LOSS", box: "KZ 174", label: t("Pertes à compenser", "Losses to offset") },
      ],
    },
  ],
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "Krypto-Meldepflichtgesetz du 23 décembre 2025, applicable depuis le 1er janvier 2026 ; premières déclarations en 2027 sur les données 2026.",
      "The Krypto-Meldepflichtgesetz applies from 1 January 2026, first reports in 2027 on 2026 data.",
    ),
  },
  assumptions: [
    t(
      "Le prix moyen glissant est calculé par portefeuille : le règlement laisse le redevable de la retenue choisir entre l'adresse et le portefeuille comme unité de référence, et ce choix s'impose ensuite à la déclaration. En autoconservation ou sur une plateforme étrangère, aucun redevable n'opère ce choix — l'hypothèse retenue ici est le portefeuille.",
      "The moving average is computed per wallet; where no Austrian withholding agent exists, nobody makes that election and the wallet is assumed.",
    ),
    t(
      "La frontière entre le staking (non imposé à la réception, coût nul) et la création de blocs (imposée à la réception) dépend de la prédominance du capital engagé sur le travail fourni : un nœud validateur propre relève probablement du minage.",
      "The boundary between staking and block creation turns on whether the service consists mainly in deploying existing crypto; running your own validator node is likely mining.",
    ),
    t(
      "Les NFT relèvent des opérations spéculatives du § 31 : imposables seulement en cas de revente dans l'année, au barème progressif jusqu'à 55 %, avec une franchise de 440 € et des pertes non compensables. Ce régime n'est pas calculé ici.",
      "NFTs fall under § 31 speculative transactions and are not computed here.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
