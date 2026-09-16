import { wealthEngine } from "@/lib/engine/tax/wealth";
import { KMU_CH } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * Switzerland.
 *
 * A private capital gain on movable assets is not taxed (art. 16 al. 3 LIFD)
 * and a capital loss is not deductible. What is taxed is the position held at
 * the end of the tax period, through the cantonal and communal wealth tax, and
 * the income received in tokens. The whole question of a Swiss file is
 * therefore whether the taxpayer stays a private investor: the working paper of
 * the federal tax administration applies the criteria of circular no. 36 by
 * analogy, and those five criteria are reproduced here verbatim because
 * failing one of them turns an exempt gain into taxable self-employment income.
 */
const REFS = {
  lifd16: { jurisdiction: "CH" as const, code: "Art. 16 al. 3 LIFD (RS 642.11)", title: "Les gains en capital réalisés sur la fortune mobilière privée sont exonérés", url: "https://www.fedlex.admin.ch/eli/cc/1991/1184_1184_1184/fr", asOf: "2026-01-01" },
  lifd18: { jurisdiction: "CH" as const, code: "Art. 18 al. 2 LIFD", title: "Les gains sur fortune commerciale sont imposables ; les pertes sont déductibles lorsqu'elles sont comptabilisées", asOf: "2026-01-01" },
  lifd20: { jurisdiction: "CH" as const, code: "Art. 20 al. 1 LIFD", title: "Rendement de la fortune mobilière : rémunération du staking et airdrops", asOf: "2026-01-01" },
  lifd17: { jurisdiction: "CH" as const, code: "Art. 17 al. 1 LIFD", title: "Salaire et prestations accessoires versés en jetons de paiement", asOf: "2026-01-01" },
  lifd32: { jurisdiction: "CH" as const, code: "Art. 32 al. 1 LIFD", title: "Déduction des frais nécessaires à l'acquisition du rendement ; les frais de transaction ne sont pas déductibles", asOf: "2026-01-01" },
  lhid: { jurisdiction: "CH" as const, code: "Art. 13 al. 1 et art. 14 al. 1 LHID (RS 642.14)", title: "Impôt cantonal sur la fortune, évaluation à la valeur vénale à la fin de la période fiscale", url: "https://www.fedlex.admin.ch/eli/cc/1991/1256_1256_1256/fr", asOf: "2026-01-01" },
  ap: { jurisdiction: "CH" as const, code: "AFC, document de travail « Cryptomonnaies et ICO/ITO », 14 décembre 2021", title: "Traitement des jetons de paiement, d'utilité et d'investissement pour la fortune, le revenu, l'impôt anticipé et les droits de timbre", url: "https://www.estv.admin.ch/estv/fr/accueil/impot-federal-direct/informations-specialisees-idf/cryptomonnaies.html", asOf: "2021-12-14" },
  kursliste: { jurisdiction: "CH" as const, code: "Liste des cours de l'AFC (ictax.admin.ch)", title: "Valeurs fiscales publiées au 31 décembre ; à défaut, cours d'une plateforme de négoce de premier plan, et à défaut le prix d'achat converti en francs", url: "https://www.ictax.admin.ch/", asOf: "2026-01-01" },
  ks36: { jurisdiction: "CH" as const, code: "Circulaire AFC n° 36 du 27 juillet 2012", title: "Commerce professionnel de titres : cinq critères cumulatifs permettant d'exclure le commerce professionnel", url: "https://www.estv.admin.ch/estv/fr/accueil/impot-federal-direct/informations-specialisees-idf/circulaires.html", asOf: "2012-07-27" },
  co957: { jurisdiction: "CH" as const, code: "Art. 957 ss et art. 960b CO (RS 220)", title: "Comptabilité commerciale ; évaluation des actifs cotés en bourse ou ayant un prix courant observable", url: "https://www.fedlex.admin.ch/eli/cc/27/317_321_377/fr", asOf: "2026-01-01" },
  ifd: { jurisdiction: "CH" as const, code: "Art. 68 LIFD", title: "Impôt fédéral direct sur le bénéfice : 8,5 % du bénéfice après impôts, soit 7,83 % effectifs", asOf: "2026-01-01" },
  aeoi: { jurisdiction: "CH" as const, code: "Loi fédérale sur l'échange international automatique de renseignements relatifs aux crypto-actifs", title: "Reprise du cadre CARF de l'OCDE ; la Suisse n'est pas soumise à DAC8, qui est une directive de l'Union", asOf: "2026-01-01" },
};

export const CH: CountryPack = {
  code: "CH",
  name: t("Suisse", "Switzerland", "Schweiz"),
  flag: "🇨🇭",
  baseCurrency: "CHF",
  alternativeCurrencies: ["EUR", "USD"],
  timezone: "Europe/Zurich",
  locale: "fr-CH",
  uiLocales: ["fr", "en"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "WEALTH",
    referenceDate: { month: 12, day: 31 },
    referenceLabel: t("Fortune au 31 décembre — impôt cantonal et communal", "Wealth at 31 December — cantonal and communal tax", "Vermögenssteuer per 31. Dezember"),
    capitalGainsExempt: true,
    capitalGainsNote: t(
      "Les gains réalisés sur des jetons de paiement détenus dans la fortune privée sont des gains en capital exonérés, et les pertes ne sont pas déductibles. Le résultat des cessions est calculé ici à titre d'information : c'est la pièce à produire si l'autorité conteste la qualification d'investisseur privé.",
      "Gains on payment tokens held in private wealth are exempt capital gains and losses are not deductible. Disposal results are computed for information: they are what you produce if the authority challenges the private-investor status.",
      "Steuerfreie private Kapitalgewinne nach Art. 16 Abs. 3 DBG",
    ),
    years: {
      2023: {
        rateLabel: t("Impôt sur la fortune — cantonal et communal", "Wealth tax — cantonal and communal"),
        notes: [
          t(
            "Le taux de l'impôt sur la fortune est fixé par le canton et la commune : il n'existe aucun barème fédéral. Les charges effectives vont d'environ 0,1 % à près de 1 % de la fortune nette selon le lieu et son niveau. L'application ne peut donc pas chiffrer l'impôt : elle produit la valeur à déclarer.",
            "Wealth tax rates are set by canton and municipality; there is no federal scale. Effective charges range from about 0.1 % to nearly 1 % of net wealth. The app produces the value to declare, not the charge.",
          ),
          t(
            "Les jetons de paiement sont déclarés à la valeur vénale du 31 décembre. L'AFC publie les valeurs fiscales des principales cryptomonnaies dans sa liste des cours ; pour celles qui n'y figurent pas, la valeur de marché d'une plateforme de négoce de premier plan peut être utilisée, et à défaut de tout cours, le prix d'achat converti en francs.",
            "Payment tokens are declared at their 31 December market value. Where the federal tax administration publishes no rate, a leading trading platform's price may be used, and failing any price, the purchase price converted into francs.",
          ),
        ],
      },
    },
    qualificationTest: {
      label: t("Critères d'exclusion du commerce professionnel de titres (circulaire n° 36)", "Safe-harbour criteria excluding professional securities dealing (circular no. 36)", "Kriterien nach Kreisschreiben Nr. 36"),
      note: t(
        "Les autorités fiscales retiennent dans tous les cas la gestion de fortune privée, et donc des gains en capital exonérés, lorsque les cinq critères suivants sont remplis cumulativement. S'ils ne le sont pas, le commerce professionnel ne peut pas être exclu et l'appréciation se fait au vu de l'ensemble des circonstances. Le document de travail de l'AFC applique ces critères par analogie aux jetons de paiement.",
        "The tax authorities always accept private wealth management, and therefore exempt capital gains, where the five criteria are cumulatively met. Where they are not, professional dealing cannot be excluded and the whole circumstances are weighed. The federal working paper applies them to payment tokens by analogy.",
        "Die Steuerbehörden gehen in jedem Fall von privater Vermögensverwaltung aus, wenn die Kriterien kumulativ erfüllt sind.",
      ),
      minHoldingDays: 182,
      maxVolumeMultiple: 5,
      declarative: [
        t(
          "1. La durée de détention des titres cédés est d'au moins six mois.",
          "1. The holding period of the securities disposed of is at least six months.",
          "Die Haltedauer der veräusserten Wertschriften beträgt mindestens 6 Monate.",
        ),
        t(
          "2. Le volume des transactions de l'année civile, soit la somme de tous les prix d'achat et de tous les produits de vente, ne dépasse pas cinq fois l'état des titres et des avoirs au début de la période fiscale.",
          "2. The transaction volume of the calendar year, the sum of all purchase prices and sale proceeds, does not exceed five times the securities and cash holdings at the beginning of the tax period.",
          "Das Transaktionsvolumen pro Kalenderjahr beträgt nicht mehr als das Fünffache des Wertschriften- und Guthabenbestands zu Beginn der Steuerperiode.",
        ),
        t(
          "3. La réalisation de gains en capital n'est pas nécessaire pour remplacer des revenus manquants destinés au train de vie ; c'est régulièrement le cas lorsque les gains réalisés représentent moins de 50 % du revenu net de la période.",
          "3. Realising capital gains is not needed to replace missing living income; regularly the case where realised gains are less than 50 % of net income for the period.",
          "Die realisierten Kapitalgewinne betragen weniger als 50 % des Reineinkommens in der Steuerperiode.",
        ),
        t(
          "4. Les placements ne sont pas financés par des fonds étrangers, ou les rendements imposables des titres sont supérieurs aux intérêts passifs proportionnels.",
          "4. The investments are not debt-financed, or the taxable income from the securities exceeds the proportionate debt interest.",
          "Die Anlagen sind nicht fremdfinanziert oder die steuerbaren Vermögenserträge sind grösser als die anteiligen Schuldzinsen.",
        ),
        t(
          "5. L'achat et la vente de dérivés, en particulier d'options, se limitent à la couverture de positions propres.",
          "5. The purchase and sale of derivatives, options in particular, is limited to hedging the taxpayer's own positions.",
          "Der Kauf und Verkauf von Derivaten beschränkt sich auf die Absicherung von eigenen Wertschriftenpositionen.",
        ),
      ],
      refs: [REFS.ks36, REFS.ap],
    },
    income: {
      taxedAtReceipt: true,
      acquisitionCost: "MARKET",
      category: t("Rendement de la fortune mobilière — art. 20 al. 1 LIFD", "Income from movable assets — art. 20(1) LIFD", "Ertrag aus beweglichem Vermögen"),
      progressive: true,
      note: t(
        "La rémunération reçue d'un pool de staking constitue un rendement de la fortune mobilière, imposé à la valeur du moment de l'encaissement ou de l'acquisition d'un droit ferme. Les airdrops sont imposés au moment de leur attribution, à leur valeur vénale. Un salaire versé en jetons est un revenu d'activité lucrative, porté sur le certificat de salaire.",
        "Staking pool rewards are income from movable assets, taxed at the value on receipt or when a firm claim arises. Airdrops are taxed on allocation at market value. Salary paid in tokens is employment income shown on the salary certificate.",
        "Entschädigung aus dem Staking-Pool qualifiziert als Ertrag aus beweglichem Vermögen.",
      ),
      refs: [REFS.lifd20, REFS.lifd17, REFS.ap],
      byKind: {
        MINING: {
          note: t(
            "Le minage en preuve de travail produit un revenu imposable ; lorsque les critères généraux de l'activité lucrative indépendante sont réunis, il s'agit d'un revenu d'activité indépendante, soumis aux cotisations sociales.",
            "Proof-of-work mining produces taxable income; where the general criteria of self-employment are met it is self-employment income, subject to social contributions.",
          ),
        },
        STAKING: {
          note: t(
            "Le staking hors pool suppose d'examiner si la personne qui exploite le validateur exerce une activité lucrative indépendante.",
            "Staking outside a pool requires examining whether running the validator is self-employment.",
          ),
        },
      },
    },
    businessTest: [
      t(
        "Les frais de transaction directement liés à l'acquisition ou à la conversion de jetons ne sont pas déductibles du rendement de la fortune ; seuls le sont les frais nécessaires à l'obtention du revenu et à l'administration des éléments de fortune.",
        "Transaction costs directly connected with acquiring or converting tokens are not deductible from investment income; only costs necessary to earn the income and administer the assets are.",
      ),
      t(
        "Si la qualification d'investisseur privé tombe, les gains deviennent un revenu d'activité indépendante soumis à l'impôt et aux cotisations AVS, et les pertes deviennent déductibles lorsqu'elles sont comptabilisées.",
        "If the private-investor status falls away, gains become self-employment income subject to tax and social contributions, and losses become deductible once booked.",
      ),
    ],
  },
  company: {
    framework: t("Code des obligations, art. 957 ss ; Swiss GAAP RPC pour les entités qui les appliquent", "Swiss Code of Obligations, art. 957 ff.; Swiss GAAP FER where applied", "Obligationenrecht / Swiss GAAP FER"),
    chart: KMU_CH,
    assetAccountWidth: 2,
    auditFile: "CSV",
    auditFileNote: t(
      "La Suisse n'impose pas de fichier des écritures normalisé. Les livres et les pièces se conservent dix ans (art. 958f CO) sous une forme permettant la consultation.",
      "Switzerland requires no standardised audit file; books and vouchers are kept for ten years in a readable form.",
    ),
    closingValuation: "FAIR_VALUE_PL",
    closingValuationNote: t(
      "L'article 960b CO permet d'évaluer à la valeur boursière ou au prix courant observable à la date du bilan les actifs cotés ou ayant un prix courant, à condition de l'indiquer en annexe et d'appliquer le traitement de manière constante ; une correction de valeur à charge du compte de résultat peut être constituée pour tenir compte des fluctuations. À défaut d'option, le coût d'acquisition diminué des dépréciations s'applique.",
      "Article 960b allows listed assets or assets with an observable current price to be measured at that price at the balance-sheet date, disclosed and applied consistently, with a value adjustment allowed for price volatility. Failing that election, cost less impairment applies.",
    ),
    costMethods: ["AVERAGE", "FIFO"],
    corporateTax: [
      { label: t("Impôt fédéral direct sur le bénéfice", "Federal corporate income tax"), rate: "0.0783", note: t("8,5 % du bénéfice après impôts, soit 7,83 % du bénéfice avant impôts.", "8.5 % of profit after tax, that is 7.83 % of pre-tax profit.") },
      { label: t("Impôt cantonal et communal (ordre de grandeur)", "Cantonal and communal tax (order of magnitude)"), rate: "0.06", note: t("La charge globale effective va d'environ 11,8 % à environ 21 % selon le canton et la commune ; ce taux n'est qu'un ordre de grandeur.", "The overall effective charge runs from about 11.8 % to about 21 % depending on canton and municipality; this rate is an order of magnitude only.") },
    ],
    refs: [REFS.co957, REFS.ifd],
  },
  forms: [
    {
      name: "Déclaration d'impôt — état des titres et autres placements de capitaux",
      label: t("État des titres du canton de domicile", "Securities schedule of the canton of residence"),
      deadline: t("Variable selon le canton, en règle générale le 31 mars, avec prolongation sur demande.", "Cantonal; generally 31 March, extendable on request."),
      boxes: [
        { id: "HOLDINGS", box: "Fortune mobilière — cryptomonnaies", label: t("Valeur des jetons au 31 décembre", "Value of tokens at 31 December") },
        { id: "INCOME", box: "Rendements — staking, airdrops", label: t("Rendements de la fortune mobilière perçus en jetons", "Investment income received in tokens") },
      ],
    },
  ],
  dac8: {
    inScope: false,
    firstReportedYear: 2027,
    note: t(
      "La Suisse n'est pas un État membre de l'Union et n'est donc pas soumise à DAC8. Elle reprend en revanche le cadre CARF de l'OCDE par une loi fédérale propre, avec des échanges avec les États partenaires ; le rapprochement reste donc utile, et il l'est d'autant plus qu'un résident suisse détenant des avoirs auprès d'un prestataire de l'Union sera déclaré par celui-ci.",
      "Switzerland is not an EU member and is not subject to DAC8. It adopts the OECD CARF through its own federal act, with exchanges with partner states, so the reconciliation still matters.",
    ),
  },
  assumptions: [
    t(
      "L'impôt sur la fortune est cantonal et communal : l'application fournit la valeur à déclarer au 31 décembre, jamais le montant de l'impôt, qui dépend du canton, de la commune, du barème et du reste de la fortune.",
      "Wealth tax is cantonal and communal: the app supplies the value to declare at 31 December, never the charge.",
    ),
    t(
      "Les jetons sont valorisés au dernier cours connu du 31 décembre. Lorsque l'AFC publie une valeur fiscale pour le jeton, c'est elle qui doit être reprise : l'application ne consulte pas encore la liste des cours et un écart est donc possible sur les principales cryptomonnaies.",
      "Tokens are valued at the last known 31 December price. Where the federal tax administration publishes a tax value, that value must be used; the app does not yet read the official list.",
    ),
    t(
      "Les critères de la circulaire n° 36 sont rappelés mais ne sont pas évalués automatiquement : deux d'entre eux supposent des données que l'application ne détient pas, le revenu net de la période et l'état des titres et avoirs au début de l'année.",
      "The circular no. 36 criteria are recorded but not evaluated automatically: two of them need data the app does not hold.",
    ),
    t(
      "La distinction entre jetons de paiement, jetons d'utilité et jetons d'investissement décide du traitement : le document de travail réserve aux jetons d'investissement un régime propre, notamment lorsqu'ils reposent sur un droit contractuel envers l'émetteur.",
      "The distinction between payment, utility and asset tokens decides the treatment, asset tokens having a regime of their own where they rest on a contractual claim on the issuer.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: wealthEngine,
};
