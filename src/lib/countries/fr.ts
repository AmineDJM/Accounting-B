import { DEFAULT_CHART } from "@/lib/engine/chart";
import { frEngine } from "@/lib/engine/tax/fr";
import { t, type CountryPack } from "./types";

const REFS = {
  art150: { jurisdiction: "FR" as const, code: "CGI, art. 150 VH bis", title: "Plus-values de cession d'actifs numériques réalisées par les particuliers", url: "https://www.legifrance.gouv.fr/codes/id/LEGISCTA000037943257/", asOf: "2026-01-01" },
  art200C: { jurisdiction: "FR" as const, code: "CGI, art. 200 C", title: "Taux forfaitaire de 12,8 % et option pour le barème progressif", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046860518", asOf: "2026-01-01" },
  social: { jurisdiction: "FR" as const, code: "CSS, art. L136-6 et L136-8", title: "Prélèvements sociaux sur les revenus du patrimoine (17,2 %)", asOf: "2026-01-01" },
  art1649: { jurisdiction: "FR" as const, code: "CGI, art. 1649 bis C", title: "Déclaration des comptes d'actifs numériques ouverts à l'étranger", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037994341", asOf: "2026-01-01" },
  amende: { jurisdiction: "FR" as const, code: "CGI, art. 1736 X", title: "Amende de 750 € par compte non déclaré (1 500 € si la valeur excède 50 000 €)", asOf: "2026-01-01" },
  anc: { jurisdiction: "FR" as const, code: "PCG, art. 619-10 à 619-17 (règlement ANC 2018-07)", title: "Comptabilisation des jetons détenus", url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/Recueils/PCG_Janvier2025/Recueil-NF-Janvier-2025.pdf", asOf: "2025-01-01" },
  fec: { jurisdiction: "FR" as const, code: "LPF, art. A47 A-1", title: "Forme et contenu du fichier des écritures comptables", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027804775/", asOf: "2026-01-01" },
  bnc: { jurisdiction: "FR" as const, code: "CGI, art. 92", title: "Bénéfices non commerciaux — revenus tirés du minage et assimilés", asOf: "2026-01-01" },
  is: { jurisdiction: "FR" as const, code: "CGI, art. 219", title: "Taux normal de l'impôt sur les sociétés", asOf: "2026-01-01" },
};

const PFU_COMPONENTS = [
  { label: t("Impôt sur le revenu (PFU)", "Income tax (flat tax)"), rate: "0.128" },
  { label: t("Prélèvements sociaux", "Social contributions"), rate: "0.172" },
];

export const FR: CountryPack = {
  code: "FR",
  name: t("France", "France", "France"),
  flag: "🇫🇷",
  baseCurrency: "EUR",
  timezone: "Europe/Paris",
  locale: "fr-FR",
  uiLocales: ["fr", "en"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "FR_PORTFOLIO",
    taxableDisposals: ["FIAT", "GOODS"],
    costMethod: "AVERAGE",
    costMethodLabel: t(
      "Prix total d'acquisition du portefeuille (art. 150 VH bis)",
      "Total acquisition price of the whole portfolio (art. 150 VH bis)",
      "Prix total d'acquisition",
    ),
    perWallet: false,
    deductFees: true,
    years: {
      2019: { components: PFU_COMPONENTS, proceedsThreshold: { amount: "305", label: t("Seuil d'exonération de 305 € de cessions annuelles", "€305 annual disposal threshold"), refs: [REFS.art150] }, notes: [t("Les échanges entre actifs numériques, stablecoins compris, bénéficient du sursis d'imposition.", "Swaps between digital assets, stablecoins included, are deferred.")] },
      2023: { components: PFU_COMPONENTS, proceedsThreshold: { amount: "305", label: t("Seuil d'exonération de 305 € de cessions annuelles", "€305 annual disposal threshold"), refs: [REFS.art150] }, notes: [t("Depuis l'imposition des revenus 2023, l'option pour le barème progressif est ouverte et doit couvrir l'ensemble des revenus de capitaux mobiliers du foyer.", "From 2023 income, the option for the progressive scale is available and must cover all the household's investment income.")] },
    },
    capitaliseAcquisitionFees: false,
    income: {
      taxedAtReceipt: true,
      acquisitionCost: "MARKET",
      category: t("Bénéfices non commerciaux (minage, staking assimilé)", "Non-commercial profits", "BNC — art. 92 CGI"),
      note: t(
        "Les jetons reçus gratuitement ou en rémunération entrent dans le prix total d'acquisition pour leur valeur à la réception ; leur imposition propre relève des BNC et n'est pas calculée ici.",
        "Tokens received free of charge enter the total acquisition price at their value on receipt; their own taxation falls under BNC and is not computed here.",
      ),
      refs: [REFS.bnc],
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: 0,
      note: t(
        "Les moins-values s'imputent uniquement sur les plus-values de même nature réalisées la même année : aucun report sur les années suivantes.",
        "Losses offset gains of the same nature realised in the same year only: no carry-forward.",
      ),
      refs: [REFS.art150],
    },
  },
  company: {
    framework: t("Plan comptable général", "French GAAP", "Plan comptable général (PCG)"),
    chart: DEFAULT_CHART,
    auditFile: "FEC",
    auditFileNote: t(
      "Fichier des écritures comptables nommé SIRENFECAAAAMMJJ.txt, séparateur « | », 18 colonnes, à remettre dès la première intervention du vérificateur.",
      "Accounting entries file named SIRENFECAAAAMMJJ.txt, pipe separator, 18 columns.",
    ),
    closingValuation: "TRANSITORY_ACCOUNTS",
    closingValuationNote: t(
      "Variations de valeur vénale inscrites en comptes transitoires 4742 (perte latente) et 4752 (gain latent), avec provision pour risque en cas de perte latente, contre-passées à l'ouverture de l'exercice suivant.",
      "Fair value changes recorded in transitory accounts 4742/4752, with a provision for latent losses, reversed at the start of the next year.",
    ),
    costMethods: ["AVERAGE", "FIFO"],
    corporateTax: [
      { label: t("Impôt sur les sociétés — taux normal", "Corporate income tax"), rate: "0.25" },
      { label: t("Taux réduit PME (jusqu'à 42 500 € de bénéfice)", "Reduced SME rate (up to €42,500)"), rate: "0.15", note: t("Sous conditions de chiffre d'affaires et de détention du capital.", "Subject to turnover and ownership conditions.") },
    ],
    refs: [REFS.anc, REFS.fec, REFS.is],
  },
  forms: [
    {
      name: "2086",
      label: t("Déclaration des plus-values de cession d'actifs numériques", "Digital asset capital gains return"),
      url: "https://www.impots.gouv.fr/formulaire/2086/declaration-des-plus-values-de-cession-dactifs-numeriques",
      deadline: t("Annexe à la déclaration de revenus, en mai-juin de l'année suivante.", "Annex to the income tax return, May-June of the following year."),
      boxes: [
        { id: "PORTFOLIO_VALUE", box: "212", label: t("Valeur globale du portefeuille au jour de la cession", "Total portfolio value at the disposal date") },
        { id: "GROSS_PROCEEDS", box: "213", label: t("Prix de cession", "Disposal price") },
        { id: "FEES", box: "214", label: t("Frais de cession", "Disposal costs") },
        { id: "NET_PROCEEDS", box: "217", label: t("Prix de cession net des frais", "Net disposal price") },
        { id: "TOTAL_ACQUISITION", box: "218", label: t("Prix total d'acquisition", "Total acquisition price") },
        { id: "FRACTIONS_DEDUCTED", box: "219", label: t("Fractions de capital initial déjà déduites", "Fractions of initial capital already deducted") },
        { id: "NET_ACQUISITION", box: "220", label: t("Prix total d'acquisition net", "Net total acquisition price") },
        { id: "NET_GAIN", box: "221", label: t("Plus ou moins-value de la cession", "Gain or loss on the disposal") },
      ],
    },
    {
      name: "2042 C",
      label: t("Déclaration complémentaire de revenus", "Supplementary income tax return"),
      boxes: [
        { id: "TAXABLE", box: "3AN", label: t("Plus-value imposable de l'année", "Taxable gain for the year") },
        { id: "LOSS", box: "3BN", label: t("Moins-value de l'année", "Loss for the year") },
      ],
    },
    {
      name: "3916-bis",
      label: t("Déclaration des comptes d'actifs numériques ouverts à l'étranger", "Declaration of digital asset accounts held abroad"),
      deadline: t("Une déclaration par compte, jointe à la déclaration de revenus.", "One form per account, filed with the income tax return."),
      boxes: [
        { id: "ACCOUNTS", box: "—", label: t("Un formulaire par compte ouvert, détenu, utilisé ou clos dans l'année", "One form per account opened, held, used or closed during the year") },
      ],
    },
  ],
  foreignAccounts: {
    required: true,
    form: "3916-bis",
    label: t("Comptes d'actifs numériques détenus à l'étranger", "Digital asset accounts held abroad"),
    penalty: t("750 € par compte non déclaré, porté à 1 500 € si la valeur du compte excède 50 000 € à un moment de l'année ; 125 € par inexactitude (250 € au-delà de 50 000 €).", "€750 per undeclared account, €1,500 above €50,000."),
    refs: [REFS.art1649, REFS.amende],
  },
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "Les prestataires agréés collectent les opérations 2026 et les transmettront à l'administration au plus tard le 30 septembre 2027.",
      "Authorised providers collect 2026 transactions and report them by 30 September 2027.",
    ),
  },
  assumptions: [
    t(
      "Les revenus de staking, de minage et les airdrops relèvent d'un régime propre (BNC ou BIC selon les cas) : l'application les valorise et les ajoute au prix d'acquisition, sans calculer l'impôt correspondant.",
      "Staking, mining and airdrop income follows its own regime: the app values it and adds it to the acquisition price without computing the corresponding tax.",
    ),
    t(
      "Les cessions d'actifs numériques réalisées à titre professionnel (BIC) sortent du champ de l'article 150 VH bis et de ce calcul.",
      "Professional trading falls outside article 150 VH bis and outside this computation.",
    ),
    t("Les NFT ne sont pas nécessairement des actifs numériques au sens de l'article L54-10-1 du code monétaire et financier : leur traitement doit être apprécié au cas par cas.", "NFTs are not necessarily digital assets within the meaning of the French monetary code: case-by-case analysis is required."),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: frEngine,
};
