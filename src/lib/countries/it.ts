import { gainsEngine } from "@/lib/engine/tax/gains";
import { OIC_IT } from "./charts";
import { t, type CountryPack } from "./types";

const REFS = {
  csexies: { jurisdiction: "IT" as const, code: "TUIR, art. 67, c. 1, lett. c-sexies)", title: "Plusvalenze e altri proventi da cripto-attività ; la permuta tra cripto-attività aventi eguali caratteristiche e funzioni non è rilevante", asOf: "2026-01-01" },
  art68: { jurisdiction: "IT" as const, code: "TUIR, art. 68, c. 9-bis", title: "Determinazione della plusvalenza, riporto delle minusvalenze entro il quarto periodo d'imposta", asOf: "2026-01-01" },
  l207: { jurisdiction: "IT" as const, code: "L. 30 dicembre 2024, n. 207, art. 1, cc. 24-25", title: "Aliquota del 33 % dal 1° gennaio 2026 ; abrogazione della soglia di 2 000 € dal 1° gennaio 2025", url: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2024-12-30;207", asOf: "2024-12-30" },
  l199: { jurisdiction: "IT" as const, code: "L. 30 dicembre 2025, n. 199, art. 1, c. 28", title: "Aliquota del 26 % per i token di moneta elettronica denominati in euro ; neutralità della conversione euro ↔ EMT", url: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2025-12-30;199", asOf: "2025-12-30" },
  circ30: { jurisdiction: "IT" as const, code: "Agenzia delle Entrate, circolare n. 30/E del 27 ottobre 2023", title: "Costo medio ponderato per denominazione ; permuta non rilevante ; quadro RW", asOf: "2023-10-27" },
  bollo: { jurisdiction: "IT" as const, code: "DPR 642/1972, tariffa art. 13, nota 3-ter ; art. 19, c. 18, DL 201/2011 (IVCA)", title: "Imposta di bollo o imposta sul valore delle cripto-attività, 2 ‰ annui", asOf: "2026-01-01" },
  rw: { jurisdiction: "IT" as const, code: "Quadro RW del modello Redditi PF, codice 21", title: "Monitoraggio fiscale delle cripto-attività, anche detenute in Italia", asOf: "2026-01-01" },
  art110: { jurisdiction: "IT" as const, code: "TUIR, art. 110, c. 3-bis", title: "Le valutazioni delle cripto-attività non concorrono al reddito d'impresa, ai fini IRES e IRAP", asOf: "2026-01-01" },
  tuir2027: { jurisdiction: "IT" as const, code: "D.Lgs. 19 giugno 2026, n. 117 (nuovo Testo unico delle imposte sui redditi)", title: "In vigore dal 4 luglio 2026, applicabile dal 1° gennaio 2027 — rinumerazione degli articoli", url: "https://www.normattiva.it/eli/id/2026/07/03/26G00131/ORIGINAL", asOf: "2026-07-03" },
};

/** MiCA-compliant euro e-money tokens, taxed at the reduced rate from 2026. */
const EURO_EMT = new Set(["EURC", "EURI", "EURCV", "EURE", "EURD"]);

export const IT: CountryPack = {
  code: "IT",
  name: t("Italie", "Italy", "Italia"),
  flag: "🇮🇹",
  baseCurrency: "EUR",
  timezone: "Europe/Rome",
  locale: "it-IT",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "GAINS",
    variant: "LOTS",
    // A swap between crypto-assets with the same characteristics and functions is
    // not a realisation; swaps into assets of a different nature are.
    taxableDisposals: ["FIAT", "GOODS", "FEE"],
    costMethod: "AVERAGE",
    costMethodLabel: t("Coût moyen pondéré par dénomination", "Weighted average cost per denomination", "Costo medio ponderato"),
    perWallet: false,
    deductFees: true,
    capitaliseAcquisitionFees: true,
    deferredSwap: {
      rollsOverCost: true,
      carriesAcquisitionDate: true,
      note: t(
        "Sur une permuta non imposable, le coût moyen pondéré du jeton cédé devient celui du jeton reçu.",
        "On a non-taxable swap the weighted average cost of the token given up becomes the cost of the token received.",
      ),
    },
    flagDisposals: [
      {
        id: "it-different-function",
        matches: (asset, counter) => Boolean(counter && (EURO_EMT.has(counter.toUpperCase()) || EURO_EMT.has(asset.toUpperCase()) || ["USDT", "USDC", "DAI", "FDUSD", "PYUSD"].includes(counter.toUpperCase()))),
        message: t(
          "Échange impliquant un stablecoin ou un token de monnaie électronique : l'administration considère qu'une permuta n'est neutre qu'entre cryptoactifs « aventi eguali caratteristiche e funzioni ». Cette opération est traitée ici comme neutre, ce qui doit être confirmé au cas par cas.",
          "Swap involving a stablecoin or an e-money token: neutrality only applies between crypto-assets with the same characteristics and functions. Treated as neutral here; confirm case by case.",
        ),
      },
    ],
    wealthLevy: {
      rate: "0.002",
      label: t("Imposta di bollo / imposta sul valore des cryptoactifs (2 ‰)", "Stamp duty or crypto-asset value tax (2 ‰)", "Imposta di bollo / IVCA"),
      note: t(
        "Deux prélèvements alternatifs de 2 ‰ par an sur la valeur détenue : le bollo lorsqu'un intermédiaire italien déclare la relation, l'IVCA à défaut. Ce n'est pas 2 % mais 2 pour mille.",
        "Two alternative levies of 2 per mille a year on the value held: stamp duty where an Italian intermediary reports the relationship, IVCA otherwise.",
      ),
      refs: [REFS.bollo],
    },
    years: {
      2023: {
        flatRate: "0.26",
        components: [{ label: t("Imposta sostitutiva", "Substitute tax"), rate: "0.26" }],
        proceedsThreshold: { amount: "2000", label: t("Soglia di 2 000 € (fino al 2024)", "€2,000 threshold (until 2024)"), refs: [REFS.l207] },
      },
      2025: {
        flatRate: "0.26",
        components: [{ label: t("Imposta sostitutiva", "Substitute tax"), rate: "0.26" }],
        notes: [t("La franchise de 2 000 € est supprimée depuis le 1er janvier 2025 : chaque opération est imposable.", "The €2,000 threshold was abolished on 1 January 2025.")],
      },
      2026: {
        flatRate: "0.33",
        specialRates: [
          {
            label: t("Token de monnaie électronique en euros (26 %)", "Euro e-money tokens (26 %)", "Token di moneta elettronica in euro"),
            rate: "0.26",
            matches: (asset: string) => EURO_EMT.has(asset.toUpperCase()),
          },
        ],
        notes: [
          t(
            "Le taux ordinaire passe à 33 % pour les gains réalisés à compter du 1er janvier 2026 ; seuls les tokens de monnaie électronique libellés en euros et conformes à MiCA conservent 26 %. Un stablecoin en dollars reste à 33 %.",
            "The ordinary rate rises to 33 % for gains realised from 1 January 2026; only MiCA-compliant euro e-money tokens keep 26 %.",
          ),
          t(
            "La simple conversion entre euros et token de monnaie électronique en euros, comme son remboursement au pair, n'est pas une réalisation.",
            "Converting between euros and a euro e-money token, and redeeming it at par, is not a realisation.",
          ),
        ],
      },
    },
    income: {
      taxedAtReceipt: true,
      acquisitionCost: "MARKET",
      category: t("Autres produits de la détention — art. 67 c-sexies", "Other proceeds from holding — art. 67 c-sexies", "Altri proventi derivanti dalla detenzione"),
      flatRate: "0.33",
      note: t(
        "Les revenus de staking sont imposés sur leur montant brut, sans déduction des commissions retenues par la plateforme.",
        "Staking income is taxed on its gross amount, with no deduction for platform fees.",
      ),
      refs: [REFS.csexies, REFS.art68],
    },
    losses: {
      offsetWithinYear: true,
      carryForwardYears: 4,
      note: t(
        "Les moins-values excédentaires sont déductibles des plus-values des quatre exercices suivants, à condition d'avoir été déclarées au titre de l'année de réalisation.",
        "Excess losses are deductible against gains of the next four years, provided they were reported for the year of realisation.",
      ),
      refs: [REFS.art68],
    },
  },
  company: {
    framework: t("Principes comptables italiens (OIC)", "Italian GAAP (OIC)", "Principi contabili OIC"),
    chart: OIC_IT,
    auditFile: "CSV",
    auditFileNote: t(
      "L'Italie n'impose pas de fichier d'audit standard : le libro giornale et le libro degli inventari sont tenus et conservés dix ans, la facturation électronique passant par le Sistema di Interscambio.",
      "Italy has no standard audit file: the journal and inventory books are kept and retained for ten years.",
    ),
    closingValuation: "NONE",
    closingValuationNote: t(
      "Les écarts de valorisation des cryptoactifs ne concourent pas au résultat imposable, quel que soit leur traitement comptable : seule la cession est imposée, sur la base du coût historique.",
      "Valuation differences on crypto-assets do not enter taxable income whatever their accounting treatment: only disposals are taxed, on historical cost.",
    ),
    costMethods: ["AVERAGE", "FIFO", "LIFO"],
    corporateTax: [
      { label: t("IRES", "Corporate income tax"), rate: "0.24" },
      { label: t("IRAP (taux régional usuel)", "Regional production tax"), rate: "0.039" },
    ],
    refs: [REFS.art110, REFS.circ30],
  },
  forms: [
    {
      name: "Modello Redditi PF — quadro RT",
      label: t("Section V-A, plus-values sur cryptoactifs", "Section V-A, crypto-asset gains"),
      deadline: t("Du 15 avril au 2 novembre 2026 pour l'exercice 2025 ; paiements au 30 juin.", "15 April to 2 November 2026 for the 2025 year; payment by 30 June."),
      boxes: [
        { id: "GROSS_PROCEEDS", box: "RT41", label: t("Contrepartie perçue ou valeur normale", "Consideration received or normal value"), note: t("Numéros de lignes issus de la documentation professionnelle, à vérifier sur les instructions officielles.", "Row numbers from professional sources, to be checked against the official instructions.") },
        { id: "COST", box: "RT42", label: t("Coût d'acquisition", "Acquisition cost") },
        { id: "CARRY", box: "RT43", label: t("Moins-values des exercices antérieurs", "Losses from earlier years") },
      ],
    },
    {
      name: "Modello Redditi PF — quadro RW",
      label: t("Suivi fiscal et imposition de la valeur détenue", "Tax monitoring and levy on the value held"),
      boxes: [
        { id: "HOLDINGS", box: "codice 21", label: t("Une ligne par portefeuille ou compte, y compris détenu en Italie", "One row per wallet or account, including those held in Italy") },
        { id: "LEVY", box: "IVCA", label: t("Imposta sul valore delle cripto-attività, 2 ‰", "Crypto-asset value tax, 2 per mille") },
      ],
    },
  ],
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "D.Lgs. 10 décembre 2025 n. 194, en vigueur le 6 janvier 2026 : déclaration des prestataires au 30 juin de l'année suivante, soit le 30 juin 2027 pour 2026.",
      "Legislative decree 194 of 10 December 2025 requires providers to report by 30 June of the following year.",
    ),
  },
  assumptions: [
    t(
      "Les échanges entre cryptoactifs sont traités comme non imposables, la loi ne visant que la permuta entre actifs « aux caractéristiques et fonctions identiques ». Les échanges impliquant un stablecoin ou un token de monnaie électronique sont signalés pour revue, car l'administration peut les qualifier de réalisation.",
      "Swaps between crypto-assets are treated as non-taxable; swaps involving a stablecoin or an e-money token are flagged for review.",
    ),
    t(
      "Le coût moyen pondéré est calculé globalement par dénomination. La circulaire 30/E raisonne en régime administré, où la moyenne est tenue par l'intermédiaire ; en régime déclaratif la portée exacte reste discutée.",
      "The weighted average cost is computed globally per denomination; circular 30/E reasons in the administered regime.",
    ),
    t(
      "Le nouveau Testo unico des impôts sur les revenus, applicable à compter du 1er janvier 2027, renumérote les articles cités : l'exercice 2026 reste régi par les textes ci-dessus.",
      "The new income tax code applies from 1 January 2027 and renumbers the articles cited; 2026 remains governed by the texts above.",
    ),
    t(
      "Les NFT suivent la nature de leur sous-jacent et ne sont pas traités spécifiquement ici.",
      "NFTs follow the nature of their underlying asset and are not handled specifically here.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: gainsEngine,
};
