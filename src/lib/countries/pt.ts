import { gainsEngine } from "@/lib/engine/tax/gains";
import { SNC_PT } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * Portugal.
 *
 * Crypto-assets entered the CIRS with the 2023 budget (lei n.º 24-D/2022) and
 * the paragraphs of article 10.º were renumbered by decreto-lei n.º 97/2026, de
 * 20 de maio. The references below use the numbering now in force and name the
 * former one, because every commentary written before May 2026 — and the tax
 * authority's own leaflet — still cites the old numbers.
 */
const REFS = {
  art10k: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 1, alínea k), CIRS", title: "Alienação onerosa de criptoativos que não constituam valores mobiliários", url: "https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx", asOf: "2026-05-20" },
  art10n20: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 20, CIRS (anterior n.º 17)", title: "Definição de criptoativo : representação digital de valor ou direitos transferível por tecnologia de registo distribuído", asOf: "2026-05-20" },
  art10n21: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 21, CIRS (anterior n.º 18)", title: "Exclusão dos criptoativos únicos e não fungíveis (NFT)", asOf: "2026-05-20" },
  art10n22: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 22, CIRS (anterior n.º 19)", title: "Exclusão dos ganhos e perdas sobre criptoativos detidos há 365 dias ou mais", asOf: "2026-05-20" },
  art10n23: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 23, CIRS (anterior n.º 20)", title: "Permuta de criptoativos : não há tributação, o valor de aquisição transfere-se para os criptoativos recebidos", asOf: "2026-05-20" },
  art10n24: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 24, CIRS (anterior n.º 21)", title: "Exclusão do benefício quando a contraparte ou o sujeito passivo não reside na UE, no EEE ou num Estado com convenção ou acordo de troca de informações", asOf: "2026-05-20" },
  art10n25: { jurisdiction: "PT" as const, code: "Artigo 10.º, n.º 25, CIRS (anterior n.º 22)", title: "A perda da qualidade de residente é equiparada a uma alienação onerosa", asOf: "2026-05-20" },
  art43: { jurisdiction: "PT" as const, code: "Artigo 43.º, n.os 5, 8 al. g) e 9, CIRS", title: "FIFO por prestador de serviços de criptoativos ; exclusão das perdas com contrapartes em regime fiscal claramente mais favorável", url: "https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs43.aspx", asOf: "2024-06-28" },
  art5: { jurisdiction: "PT" as const, code: "Artigo 5.º, n.º 2 al. u) e n.º 11, CIRS", title: "Remunerações de operações com criptoativos ; quando pagas em criptoativos, tributadas como mais-valia no momento da alienação", url: "https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs5.aspx", asOf: "2023-01-01" },
  art72: { jurisdiction: "PT" as const, code: "Artigo 72.º, n.os 1 al. c) e 13, CIRS", title: "Taxa autónoma de 28 % e opção pelo englobamento", url: "https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs72.aspx", asOf: "2023-12-29" },
  art55: { jurisdiction: "PT" as const, code: "Artigo 55.º, n.º 1 al. d), CIRS", title: "Reporte do saldo negativo por cinco anos, apenas em caso de englobamento", asOf: "2023-12-29" },
  art31: { jurisdiction: "PT" as const, code: "Artigo 31.º, n.os 1 al. a) e d) e n.º 17, CIRS", title: "Coeficientes do regime simplificado : 0,15 para operações com criptoativos, 0,95 para a mineração", asOf: "2023-01-01" },
  art220: { jurisdiction: "PT" as const, code: "Artigo 220.º da Lei n.º 24-D/2022, de 30 de dezembro", title: "O período de detenção dos criptoativos adquiridos antes de 1 de janeiro de 2023 conta para o prazo de 365 dias", asOf: "2023-01-01" },
  art52: { jurisdiction: "PT" as const, code: "Artigo 52.º, n.º 1, CIRS", title: "A AT pode determinar o valor de alienação, presumindo-se o valor de mercado à data", asOf: "2023-01-01" },
  saft: { jurisdiction: "PT" as const, code: "Portaria n.º 302/2016, de 2 de dezembro", title: "Estrutura do SAF-T (PT) versão 1.04_01", asOf: "2016-12-02" },
  irc: { jurisdiction: "PT" as const, code: "Artigo 87.º CIRC e artigo 18.º da Lei n.º 73/2013 (derrama municipal)", title: "IRC a 20 % (taxa geral desde 2025), 16 % sobre os primeiros 50 000 € das PME, mais derrama municipal e estadual", asOf: "2026-01-01" },
  dac8: { jurisdiction: "PT" as const, code: "Transposição da diretiva (UE) 2023/2226", title: "Obrigação de comunicação dos prestadores de serviços de criptoativos a partir de 2026", asOf: "2026-01-01" },
};

const YEAR = {
  flatRate: "0.28",
  components: [{ label: t("Taxa autónoma sur les plus-values de crypto-actifs", "Autonomous rate on crypto capital gains", "Taxa autónoma — artigo 72.º, n.º 1, al. c)"), rate: "0.28" }],
  notes: [
    t(
      "L'option pour l'englobamento (barème progressif jusqu'à 48 %, plus la taxa adicional de solidariedade) est globale et conditionne le report des pertes : sans elle, une moins-value de l'année ne s'impute sur aucune autre année.",
      "The option for aggregation at the progressive rates is all-or-nothing and conditions loss carry-forward: without it a loss is lost at the end of the year.",
    ),
    t(
      "Les dépenses nécessaires et effectivement supportées à l'acquisition et à la cession sont déductibles du gain.",
      "Costs necessary and actually incurred on acquisition and disposal reduce the gain.",
    ),
  ],
};

export const PT: CountryPack = {
  code: "PT",
  name: t("Portugal", "Portugal", "Portugal"),
  flag: "🇵🇹",
  baseCurrency: "EUR",
  timezone: "Europe/Lisbon",
  locale: "pt-PT",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    // A swap against other crypto-assets is not taxed: article 10.º, n.º 23
    // rolls the acquisition value over onto the tokens received.
    taxableDisposals: ["FIAT", "GOODS"],
    costMethod: "FIFO",
    costMethodLabel: t("PEPS par prestataire de services sur crypto-actifs (art. 43.º, n.º 8 al. g et n.º 9)", "FIFO per crypto-asset service provider", "FIFO por prestador de serviços de criptoativos"),
    // n.º 9 applies the FIFO rule "por referência a cada uma dessas entidades":
    // the queue is held per provider, not across the whole portfolio.
    perWallet: true,
    exemptAfterDays: 365,
    exemptAfterDaysLabel: t(
      "Exclusion des gains et des pertes sur les crypto-actifs détenus depuis 365 jours ou plus (art. 10.º, n.º 22). La détention antérieure au 1er janvier 2023 compte.",
      "Gains and losses on crypto-assets held for 365 days or more are excluded; holding before 1 January 2023 counts.",
      "Artigo 10.º, n.º 22 — 365 dias",
    ),
    deductFees: true,
    capitaliseAcquisitionFees: true,
    deferredSwap: {
      rollsOverCost: true,
      carriesAcquisitionDate: false,
      note: t(
        "L'échange contre d'autres crypto-actifs n'est pas imposé : les jetons reçus prennent la valeur d'acquisition de ceux remis. Le texte ne transfère pas la date d'acquisition, de sorte qu'un délai de 365 jours recommence en principe à courir — point à faire confirmer, il décide de l'exonération.",
        "A swap against other crypto-assets is not taxed: the tokens received take the acquisition value of those given up. The text does not carry the acquisition date over, so the 365-day period arguably restarts.",
      ),
    },
    flagDisposals: [
      {
        id: "pt-securities",
        matches: (asset) => ["STETH", "RETH", "CBETH", "WBTC", "WETH"].includes(asset.toUpperCase()),
        message: t(
          "Jeton susceptible de constituer une valeur mobilière : l'alinéa k) ne vise que les crypto-actifs qui n'en sont pas, et un crypto-actif qualifié de valeur mobilière relève des alinéas b) et g), sans exonération de 365 jours. À qualifier avant de conclure.",
          "Token that may qualify as a security: paragraph k) only covers crypto-assets that are not securities, and the 365-day exemption then does not apply.",
        ),
      },
      {
        id: "pt-nft",
        matches: (asset) => asset.toUpperCase().startsWith("NFT"),
        message: t(
          "Les crypto-actifs uniques et non fongibles sont exclus du régime par l'article 10.º, n.º 21 : ils ne relèvent ni de l'alinéa k) ni de l'exonération de 365 jours.",
          "Unique and non-fungible crypto-assets are excluded by article 10.º, n.º 21.",
        ),
      },
    ],
    years: { 2023: YEAR, 2026: YEAR },
    income: {
      // Article 5.º, n.º 11: remuneration paid in crypto-assets is not taxed on
      // receipt but as a capital gain when the tokens received are disposed of.
      taxedAtReceipt: false,
      acquisitionCost: "ZERO",
      category: t("Rendimentos de capitais — art. 5.º, n.º 2 al. u)", "Capital income — art. 5.º(2)(u)", "Rendimentos de capitais"),
      flatRate: "0.28",
      note: t(
        "Une rémunération d'opérations sur crypto-actifs versée en jetons n'est pas imposée à la réception : elle est imposée comme plus-value lors de la cession des jetons reçus, qui entrent donc pour une valeur d'acquisition nulle. Versée en euros, elle est un revenu de capitaux imposé à 28 % l'année de l'encaissement.",
        "Remuneration from crypto operations paid in tokens is not taxed on receipt but as a capital gain when those tokens are disposed of, so they enter at nil cost. Paid in euro, it is capital income taxed at 28 % in the year received.",
      ),
      refs: [REFS.art5, REFS.art10n23],
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: 5,
      note: t(
        "Le report sur cinq ans n'est ouvert qu'au contribuable qui opte pour l'englobamento ou y est tenu. Sous le taux autonome de 28 %, une moins-value ne s'impute que sur les plus-values de la même année. Les pertes réalisées avec une contrepartie soumise à un régime fiscal clairement plus favorable ne sont jamais prises en compte.",
        "The five-year carry-forward is open only where the taxpayer opts for, or is required to use, aggregation. Losses realised against a counterparty in a clearly more favourable tax regime never count.",
      ),
      refs: [REFS.art55, REFS.art43],
    },
  },
  company: {
    framework: t("Sistema de Normalização Contabilística (SNC)", "Portuguese accounting standards (SNC)", "Sistema de Normalização Contabilística"),
    chart: SNC_PT,
    assetAccountWidth: 1,
    auditFile: "SAFT_PT",
    auditFileNote: t(
      "Le SAF-T (PT) version 1.04_01 est produit sur demande de l'Autoridade Tributária. La partie facturation relève d'un logiciel certifié au sens de l'article 123.º du CIRC et n'est pas produite ici.",
      "SAF-T (PT) 1.04_01 is produced on request; the invoicing part requires certified software and is not produced here.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Dépréciation au plus faible du coût et de la valeur réalisable nette, avec reprise obligatoire lorsque la cause disparaît. Une entité qui négocie des crypto-actifs à titre professionnel peut relever de la juste valeur par résultat : la qualification se décide au cas par cas.",
      "Lower of cost and net realisable value, with mandatory reversal; a trading entity may fall under fair value through profit or loss.",
    ),
    costMethods: ["FIFO", "AVERAGE"],
    corporateTax: [
      { label: t("IRC — taxa geral", "Corporate income tax — general rate"), rate: "0.20" },
      { label: t("IRC — PME, premiers 50 000 €", "Corporate income tax — SMEs, first €50,000"), rate: "0.16" },
      { label: t("Derrama municipal (maximum)", "Municipal surcharge (maximum)"), rate: "0.015", note: t("Fixée par chaque commune, dans la limite de 1,5 % du bénéfice imposable.", "Set by each municipality, capped at 1.5 % of taxable profit.") },
    ],
    refs: [REFS.irc, REFS.saft],
  },
  forms: [
    {
      name: "Modelo 3 — Anexo G",
      label: t("Plus-values et autres accroissements de patrimoine", "Capital gains and other increases in wealth"),
      deadline: t("Du 1er avril au 30 juin de l'année suivante.", "1 April to 30 June of the following year."),
      boxes: [
        { id: "PROCEEDS", box: "Quadro 18 — valor de realização", label: t("Valeur de cession des crypto-actifs détenus moins de 365 jours", "Disposal value of crypto-assets held under 365 days") },
        { id: "COST", box: "Quadro 18 — valor de aquisição", label: t("Valeur d'acquisition", "Acquisition value") },
        { id: "FEES", box: "Quadro 18 — despesas e encargos", label: t("Dépenses nécessaires supportées", "Necessary costs incurred") },
        { id: "OPTION", box: "Quadro 15", label: t("Option pour l'englobamento", "Option for aggregation") },
      ],
    },
    {
      name: "Modelo 3 — Anexo G1",
      label: t("Plus-values non imposées", "Non-taxed capital gains"),
      boxes: [{ id: "EXEMPT", box: "Criptoativos detidos ≥ 365 dias", label: t("Cessions exonérées par la détention de 365 jours", "Disposals exempt through the 365-day holding period") }],
    },
    {
      name: "Modelo 3 — Anexo B",
      label: t("Revenus professionnels et d'entreprise — régime simplifié", "Business and professional income — simplified regime"),
      boxes: [
        { id: "OPS", box: "Coeficiente 0,15", label: t("Opérations sur crypto-actifs autres que le minage", "Crypto-asset operations other than mining") },
        { id: "MINING", box: "Coeficiente 0,95", label: t("Minage de crypto-actifs", "Crypto-asset mining") },
      ],
    },
  ],
  foreignAccounts: {
    required: true,
    form: "Modelo 3 — Anexo J",
    label: t(
      "Les revenus obtenus à l'étranger, y compris auprès d'un prestataire de crypto-actifs non résident, se déclarent à l'annexe J. L'identification des comptes ouverts hors du Portugal figure au quadro 11 de l'annexe J.",
      "Income obtained abroad, including from a non-resident crypto provider, is declared in annex J; accounts held outside Portugal are identified in its quadro 11.",
    ),
    refs: [REFS.art10n24],
  },
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "Portugal transpose la directive (UE) 2023/2226 : les prestataires déclarent les opérations de 2026 en 2027.",
      "Portugal transposes directive (EU) 2023/2226: providers report 2026 transactions in 2027.",
    ),
  },
  assumptions: [
    t(
      "L'article 10.º, n.º 24 exclut du bénéfice de l'exonération et de la neutralité des échanges les opérations dont la contrepartie ou le contribuable ne réside pas dans l'UE, l'EEE ou un État lié au Portugal par une convention ou un accord d'échange de renseignements. Le texte consolidé renvoie encore aux « n.os 19 e 20 », c'est-à-dire à l'ancienne numérotation des actuels n.os 22 et 23 : la lecture retenue ici est celle du renvoi corrigé. Ce contrôle n'est pas automatisé — la résidence du prestataire doit être saisie dans le dossier.",
      "Article 10.º, n.º 24 denies the exemption and the swap neutrality where the counterparty or the taxpayer is not resident in the EU, the EEA or a State bound to Portugal by a treaty or an exchange-of-information agreement. The consolidated text still cross-refers to the former numbering.",
    ),
    t(
      "L'échange de crypto-actifs reporte la valeur d'acquisition mais le texte ne dit pas qu'il reporte la date d'acquisition. Le compteur de 365 jours est donc remis à zéro à chaque échange dans le calcul proposé ici : c'est la lecture la plus prudente, et elle est défavorable au contribuable. À faire trancher avec le conseil local.",
      "A swap rolls the acquisition value over but the text does not say it carries the acquisition date. The 365-day clock is therefore restarted here, which is the cautious and unfavourable reading.",
    ),
    t(
      "La frontière entre le crypto-actif ordinaire et celui qui constitue une valeur mobilière n'est pas définie par le CIRS : elle décide pourtant de l'exonération de 365 jours. Les jetons emballés et les dérivés de staking liquide sont signalés pour qualification.",
      "The CIRS does not define when a crypto-asset is a security, although that decides the 365-day exemption; wrapped tokens and liquid staking derivatives are flagged for qualification.",
    ),
    t(
      "La perte de la qualité de résident est assimilée à une cession à titre onéreux (art. 10.º, n.º 25). Ce départ n'est pas calculé automatiquement : indiquez la date de départ dans le dossier pour que la cession réputée soit produite.",
      "Loss of Portuguese residence is treated as an onerous disposal; enter the departure date in the file for the deemed disposal to be produced.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
