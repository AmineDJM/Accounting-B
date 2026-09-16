import { gainsEngine } from "@/lib/engine/tax/gains";
import { PCMN_BE } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * Belgium.
 *
 * Belgium taxed nothing on a private crypto gain until 2026. The law
 * introducing a tax on capital gains on financial assets applies to gains
 * realised from 1 January 2026, at 10 % after a yearly exempt tranche, and it
 * sits *beside* the old article 90, 1° CIR 92 rather than replacing it: normal
 * management of private wealth now falls under the new 10 % tax, while
 * abnormal management or speculation stays taxable at 33 %. The whole
 * difficulty of a Belgian file is on which side of that line the taxpayer is,
 * and the app therefore computes the 10 % figure and states the criteria
 * instead of pretending the question is settled.
 */
const REFS = {
  law: { jurisdiction: "BE" as const, code: "Loi introduisant un impôt sur les plus-values sur les actifs financiers", title: "Régime général : 10 % après une tranche annuelle exonérée ; applicable aux plus-values réalisées à partir du 1er janvier 2026", asOf: "2026-01-01" },
  micar: { jurisdiction: "EU" as const, code: "Règlement (UE) 2023/1114 (MiCA), art. 3, § 1er, 5)", title: "Définition du crypto-actif reprise par la loi belge", url: "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32023R1114", asOf: "2023-05-31" },
  art90: { jurisdiction: "BE" as const, code: "Article 90, alinéa 1er, 1°, CIR 92", title: "Revenus divers : opérations sortant de la gestion normale d'un patrimoine privé, imposées à 33 %", url: "https://eservices.minfin.fgov.be/myminfin-web/pages/fisconet", asOf: "2026-01-01" },
  art102: { jurisdiction: "BE" as const, code: "Article 102, § 5, CIR 92", title: "Imputation des moins-values de la même période imposable et de la même catégorie", asOf: "2026-01-01" },
  step: { jurisdiction: "BE" as const, code: "Loi précitée, régime transitoire", title: "Valeur au 31 décembre 2025 comme prix d'acquisition ; la valeur d'acquisition réelle est retenue jusqu'au 31 décembre 2030 si elle est supérieure et prouvée", asOf: "2026-01-01" },
  exit: { jurisdiction: "BE" as const, code: "Loi précitée, exit tax", title: "Report automatique de paiement lors du départ vers certaines juridictions", asOf: "2026-01-01" },
  pcc: { jurisdiction: "BE" as const, code: "Article 307, § 1er/1, CIR 92", title: "Déclaration des comptes à l'étranger et point de contact central de la Banque nationale", asOf: "2026-01-01" },
  cnc: { jurisdiction: "BE" as const, code: "Avis CNC/CBN 2021/16 du 8 décembre 2021", title: "Traitement comptable des crypto-actifs : créance ou placement selon la destination, jamais de la trésorerie", url: "https://www.cnc-cbn.be/", asOf: "2021-12-08" },
  isoc: { jurisdiction: "BE" as const, code: "Article 215 CIR 92", title: "Impôt des sociétés : 25 %, taux réduit de 20 % sur les premiers 100 000 € pour les PME remplissant les conditions", asOf: "2026-01-01" },
  dac8: { jurisdiction: "BE" as const, code: "Transposition de la directive (UE) 2023/2226", title: "Obligation déclarative des prestataires de services sur crypto-actifs à partir de 2026", asOf: "2026-01-01" },
};

const SPECULATION_CRITERIA = [
  t(
    "Part du patrimoine mobilier investie en crypto-actifs.",
    "Share of movable wealth invested in crypto-assets.",
    "Percentage van het roerende vermogen dat in cryptoactiva wordt belegd.",
  ),
  t("Recours ou non à un financement pour acheter les crypto-actifs.", "Whether the purchases are debt-financed."),
  t("Recours à un processus automatisé ou à un logiciel pour acheter.", "Use of an automated process or software to trade."),
  t("Nombre de transactions effectuées.", "Number of transactions carried out."),
];

export const BE: CountryPack = {
  code: "BE",
  name: t("Belgique", "Belgium", "België"),
  flag: "🇧🇪",
  baseCurrency: "EUR",
  timezone: "Europe/Brussels",
  locale: "fr-BE",
  uiLocales: ["fr", "en"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    // The law taxes the realisation of a gain on a financial asset. A swap of
    // one crypto-asset for another realises the first one, so every disposal
    // kind is taxable; there is no deferral comparable to Austria's.
    taxableDisposals: ["FIAT", "CRYPTO", "GOODS", "FEE"],
    costMethod: "FIFO",
    costMethodLabel: t("PEPS (méthode FIFO retenue par la loi)", "FIFO, the method the law retains", "FIFO-methode"),
    perWallet: false,
    legacyBefore: "2026-01-01",
    legacyTreatment: "STEP_UP",
    legacyLabel: t(
      "Actifs acquis avant le 1er janvier 2026 : le prix d'acquisition est la valeur au 31 décembre 2025. Si la valeur d'acquisition réelle lui est supérieure et que le contribuable la prouve, elle est retenue pour les cessions réalisées jusqu'au 31 décembre 2030.",
      "Assets acquired before 1 January 2026 take the 31 December 2025 value as their cost; where the real acquisition value is higher and proven, it is retained for disposals up to 31 December 2030.",
      "Waarde op 31 december 2025 als aanschaffingswaarde",
    ),
    // "Aucun frais exposé pour les opérations d'acquisition ou de vente de cet
    // actif n'est pris en compte dans ce calcul" — the base is a net one in the
    // sense that it ignores fees on both sides, not that it deducts them.
    deductFees: false,
    capitaliseAcquisitionFees: false,
    years: {
      2026: {
        flatRate: "0.10",
        components: [{ label: t("Impôt sur les plus-values sur actifs financiers — régime général", "Tax on capital gains on financial assets — general regime", "Meerwaardebelasting — algemeen regime"), rate: "0.10" }],
        allowance: {
          amount: "10000",
          kind: "FREIBETRAG",
          label: t(
            "Tranche annuelle exonérée de 10 000 € (montant indexé, exercice d'imposition 2027). La partie non utilisée est reportable à hauteur de 1 000 € par période imposable, sans dépasser 15 000 €.",
            "Yearly exempt tranche of €10,000 (indexed, assessment year 2027); the unused part carries up by €1,000 a year, capped at €15,000.",
            "Vrijstelling van 10.000 euro per jaar",
          ),
          refs: [REFS.law],
        },
        notes: [
          t(
            "L'impôt ne frappe que les plus-values réalisées à partir du 1er janvier 2026 : une cession antérieure reste hors champ.",
            "The tax only reaches gains realised from 1 January 2026.",
          ),
          t(
            "Ce taux suppose une gestion normale du patrimoine privé. En cas de gestion anormale ou de spéculation, le gain relève de l'article 90, alinéa 1er, 1°, CIR 92 et est imposé à 33 %, ce que l'application ne calcule pas automatiquement.",
            "The rate assumes normal management of private wealth; abnormal management or speculation moves the gain to article 90, 1° and a 33 % rate, which the app does not compute automatically.",
          ),
          t(
            "Un intermédiaire belge peut prélever l'impôt à la source. Le prélèvement dispense alors de déclarer le revenu, mais les opérations réalisées auprès d'un prestataire étranger restent à déclarer.",
            "A Belgian intermediary may withhold the tax, which then dispenses with declaring the income; transactions with a foreign provider still have to be declared.",
          ),
        ],
      },
    },
    income: {
      taxedAtReceipt: true,
      acquisitionCost: "MARKET",
      category: t("Revenus divers ou revenus mobiliers selon la nature de l'opération", "Miscellaneous or movable income depending on the nature of the operation", "Diverse of roerende inkomsten"),
      flatRate: "0.30",
      note: t(
        "Le staking, le lending et les airdrops ne sont pas visés par la loi sur les plus-values : selon leur nature, ils relèvent des revenus mobiliers (30 %) ou des revenus divers (33 %). La qualification dépend du contrat et de l'ampleur de l'activité et doit être arbitrée par le conseil : le taux retenu ici est indicatif.",
        "Staking, lending and airdrops are outside the capital-gains law: depending on their nature they are movable income (30 %) or miscellaneous income (33 %). The rate used here is indicative.",
      ),
      refs: [REFS.art90],
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: 0,
      note: t(
        "Les moins-values ne s'imputent que sur les plus-values réalisées par le même contribuable, au cours de la même période imposable et dans la même catégorie d'actifs financiers. Aucun report sur les années suivantes : le calendrier des cessions est donc décisif.",
        "Losses offset only gains realised by the same taxpayer, in the same taxable period and within the same category of financial assets. No carry-forward at all.",
      ),
      refs: [REFS.art102],
    },
  },
  company: {
    framework: t("Plan comptable minimum normalisé (PCMN) et droit comptable belge", "Belgian accounting law and the minimum standardised chart", "Minimumindeling van het algemeen rekeningenstelsel"),
    chart: PCMN_BE,
    assetAccountWidth: 2,
    auditFile: "CSV",
    auditFileNote: t(
      "La Belgique n'impose pas de fichier des écritures normalisé. Le contrôle s'exerce sur la comptabilité elle-même : conservez le journal détaillé, les justificatifs de cours et le rapprochement DAC8 pendant sept ans.",
      "Belgium has no standardised audit file; keep the detailed ledger, the price evidence and the DAC8 reconciliation for seven years.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "L'avis CNC 2021/16 classe les crypto-actifs en créances ou en placements de trésorerie selon leur destination, jamais en valeurs disponibles : la règle de la valeur la plus faible s'applique, avec reprise lorsque la dépréciation cesse d'être justifiée.",
      "CNC opinion 2021/16 classifies crypto-assets as receivables or investments depending on their purpose, never as cash: the lower of cost and market applies.",
    ),
    costMethods: ["FIFO", "AVERAGE"],
    corporateTax: [
      { label: t("Impôt des sociétés — taux plein", "Corporate income tax — full rate"), rate: "0.25" },
      { label: t("Impôt des sociétés — taux réduit PME sur les premiers 100 000 €", "Corporate income tax — reduced SME rate on the first €100,000"), rate: "0.20", note: t("Sous conditions, dont une rémunération minimale de dirigeant.", "Subject to conditions, including a minimum director's remuneration.") },
    ],
    refs: [REFS.cnc, REFS.isoc],
  },
  forms: [
    {
      name: "Déclaration à l'impôt des personnes physiques — cadre XIII",
      label: t("Revenus divers de nature mobilière et plus-values sur actifs financiers", "Miscellaneous movable income and capital gains on financial assets"),
      deadline: t("Fin juin sur papier, mi-juillet via Tax-on-web ; délai étendu pour les dossiers déposés par un mandataire.", "End of June on paper, mid-July via Tax-on-web; later for files filed by an agent."),
      boxes: [
        { id: "NET_GAIN", box: "Plus-values sur actifs financiers", label: t("Plus-values nettes imposables à 10 %", "Net gains taxable at 10 %") },
        { id: "ALLOWANCE", box: "Tranche exonérée", label: t("Tranche annuelle exonérée utilisée", "Yearly exempt tranche used") },
        { id: "SPECULATIVE", box: "1440/2440", label: t("Revenus divers imposables à 33 % (gestion anormale ou spéculation)", "Miscellaneous income taxable at 33 %") },
      ],
    },
  ],
  foreignAccounts: {
    required: true,
    form: "Cadre XIV — comptes à l'étranger et point de contact central",
    label: t(
      "L'existence d'un compte à l'étranger se déclare dans la déclaration et se communique au point de contact central de la Banque nationale de Belgique. Un compte ouvert chez un prestataire de services sur crypto-actifs établi hors de Belgique entre dans cette obligation dès lors qu'il permet de détenir des avoirs.",
      "A foreign account is declared in the return and reported to the National Bank's central contact point; an account with a crypto-asset service provider established outside Belgium falls within it.",
    ),
    refs: [REFS.pcc],
  },
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "La Belgique transpose la directive (UE) 2023/2226 : les prestataires déclarent les opérations de 2026 en 2027, la première année où la plus-value est elle-même imposable.",
      "Belgium transposes directive (EU) 2023/2226: providers report 2026 transactions in 2027, the first year the gain is itself taxable.",
    ),
  },
  assumptions: [
    t(
      "Le calcul suppose une gestion normale du patrimoine privé. Les critères que les travaux préparatoires citent pour une plus-value sur crypto-actifs sont rappelés dans le dossier ; ils ne sont pas évalués automatiquement parce qu'ils supposent des informations que l'application ne détient pas, à commencer par le patrimoine mobilier total.",
      "The computation assumes normal management of private wealth. The criteria cited in the preparatory works are recorded in the file but not evaluated automatically.",
    ),
    ...SPECULATION_CRITERIA,
    t(
      "La valeur au 31 décembre 2025 doit être établie et conservée pour chaque actif détenu à cette date : sans elle, le prix d'acquisition retenu sera contesté. L'application la calcule au dernier cours connu de l'année, ce qui n'est pas nécessairement la modalité que la loi prévoit — vérifiez-la.",
      "The 31 December 2025 value must be established and kept for every asset held then; the app computes it at the last known price of the year, which may not be the method the law prescribes.",
    ),
    t(
      "L'échange d'un crypto-actif contre un autre est traité ici comme une réalisation. La loi taxe la plus-value réalisée sur un actif financier sans prévoir de neutralité pour les échanges entre crypto-actifs, contrairement à l'Autriche et au Portugal.",
      "A swap between crypto-assets is treated as a realisation: the law provides no swap neutrality, unlike Austria and Portugal.",
    ),
    t(
      "Le régime des revenus de staking, de lending et des airdrops n'est pas réglé par la loi sur les plus-values et n'a pas fait l'objet d'une circulaire : le taux de 30 % appliqué est une hypothèse de travail à valider dossier par dossier.",
      "Staking, lending and airdrop income is not settled by the capital-gains law and no circular has been issued: the 30 % rate used is a working assumption.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
