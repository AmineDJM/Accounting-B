import { wealthEngine } from "@/lib/engine/tax/wealth";
import { RGS_NL } from "./charts";
import { t, type CountryPack } from "./types";

/**
 * Netherlands.
 *
 * Crypto-assets are "overige bezittingen" in box 3: what is taxed is not the
 * gain but a deemed return on the position held on 1 January, at a rate set
 * each year. Since the Hoge Raad rulings of 6 June 2024 and the Wet
 * tegenbewijsregeling box 3, a taxpayer whose actual return is lower may be
 * taxed on that instead — and for a crypto holder that is frequently the case,
 * because the actual return includes unrealised falls in value.
 *
 * Every figure below comes from the Belastingdienst's own calculation page for
 * the year concerned.
 */
const REFS = {
  wetIB53: { jurisdiction: "NL" as const, code: "Artikel 5.3 Wet inkomstenbelasting 2001", title: "Rendementsgrondslag : bezittingen minus schulden ; cryptovaluta als overige bezittingen", url: "https://wetten.overheid.nl/BWBR0011353", asOf: "2026-01-01" },
  wetIB52: { jurisdiction: "NL" as const, code: "Artikel 5.2 Wet IB 2001", title: "Forfaitair rendement en peildatum van 1 januari", asOf: "2026-01-01" },
  hr2024: { jurisdiction: "NL" as const, code: "Hoge Raad, 6 juni 2024, ECLI:NL:HR:2024:704 e.a.", title: "Le forfait ne peut excéder le rendement réel ; droit à la preuve contraire", asOf: "2024-06-06" },
  tegenbewijs: { jurisdiction: "NL" as const, code: "Wet tegenbewijsregeling box 3", title: "Imposition sur le rendement réel lorsqu'il est inférieur au forfait ; formulaire Opgaaf werkelijk rendement pour 2024 et avant, déclaration ordinaire à partir de 2025", url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/wat-is-mijn-werkelijk-rendement", asOf: "2025-01-01" },
  box1: { jurisdiction: "NL" as const, code: "Artikel 3.90 Wet IB 2001 — resultaat uit overige werkzaamheden", title: "Passage en case 1 lorsque l'activité excède la gestion normale d'un patrimoine", asOf: "2026-01-01" },
  bw2t9: { jurisdiction: "NL" as const, code: "Boek 2, titel 9, Burgerlijk Wetboek et RJ 290/RJk", title: "Comptabilité des sociétés néerlandaises ; évaluation des actifs financiers", asOf: "2026-01-01" },
  vpb: { jurisdiction: "NL" as const, code: "Artikel 22 Wet op de vennootschapsbelasting 1969", title: "Vennootschapsbelasting : 19 % jusqu'à 200 000 € de bénéfice, 25,8 % au-delà", asOf: "2026-01-01" },
  xaf: { jurisdiction: "NL" as const, code: "XML Auditfile Financieel 3.2", title: "Fichier d'audit produit sur demande lors d'un contrôle", url: "https://www.auditfiles.nl/", asOf: "2026-01-01" },
  dac8: { jurisdiction: "NL" as const, code: "Transposition de la directive (UE) 2023/2226", title: "Obligation déclarative des prestataires de services sur crypto-actifs à partir de 2026", asOf: "2026-01-01" },
};

export const NL: CountryPack = {
  code: "NL",
  name: t("Pays-Bas", "Netherlands", "Nederland"),
  flag: "🇳🇱",
  baseCurrency: "EUR",
  timezone: "Europe/Amsterdam",
  locale: "nl-NL",
  uiLocales: ["en", "fr"],
  fiscalYear: { endMonth: 12, endDay: 31 },
  individual: {
    kind: "WEALTH",
    referenceDate: { month: 1, day: 1 },
    // The peildatum is the position at the start of 1 January, so a purchase
    // made that day is outside the base.
    referenceMoment: "START_OF_DAY",
    referenceLabel: t("Position au 1er janvier (peildatum) — case 3", "Position on 1 January (peildatum) — box 3", "Box 3 — peildatum 1 januari"),
    capitalGainsExempt: true,
    capitalGainsNote: t(
      "Les plus-values ne sont pas imposées en tant que telles : la case 3 frappe un rendement forfaitaire calculé sur la valeur détenue au 1er janvier. Le résultat des cessions est calculé ici à titre d'information et sert de base au régime de la preuve contraire.",
      "Gains are not taxed as such: box 3 taxes a deemed return on the 1 January position. Disposal results are computed here for information and feed the counter-evidence scheme.",
      "Vermogensrendementsheffing, geen vermogenswinstbelasting",
    ),
    years: {
      2023: {
        deemedReturnRate: "0.0617",
        exemptCapital: "57000",
        rate: "0.32",
        rateLabel: t("Rendement forfaitaire des « overige bezittingen » 2023", "Deemed return on other assets, 2023"),
        notes: [t("Taux d'imposition de la case 3 : 32 % en 2023.", "Box 3 rate: 32 % in 2023.")],
      },
      2024: {
        deemedReturnRate: "0.0604",
        exemptCapital: "57000",
        rate: "0.36",
        rateLabel: t("Rendement forfaitaire des « overige bezittingen » 2024", "Deemed return on other assets, 2024"),
      },
      2025: {
        deemedReturnRate: "0.0588",
        exemptCapital: "57684",
        rate: "0.36",
        rateLabel: t("Rendement forfaitaire des « overige bezittingen » 2025", "Deemed return on other assets, 2025"),
      },
      2026: {
        deemedReturnRate: "0.0600",
        exemptCapital: "59357",
        rate: "0.36",
        rateLabel: t("Rendement forfaitaire des « overige bezittingen » 2026", "Deemed return on other assets, 2026"),
        notes: [
          t(
            "Les avoirs bancaires suivent un taux distinct (1,28 % en 2026) et les dettes un taux de 2,70 % : l'estimation produite ici ne porte que sur les actifs numériques.",
            "Bank balances follow a separate rate (1.28 % in 2026) and debts 2.70 %: the estimate here covers digital assets only.",
          ),
          t(
            "Le capital exonéré est individuel : un partenaire fiscal double le montant et permet de répartir la base librement entre les deux déclarations.",
            "The exempt capital is per person: a tax partner doubles it and lets the base be split freely between the two returns.",
          ),
        ],
      },
    },
    actualReturn: {
      label: t("Régime de la preuve contraire (tegenbewijsregeling)", "Counter-evidence scheme", "Tegenbewijsregeling box 3"),
      note: t(
        "Lorsque le rendement réel de l'année est inférieur au forfait, c'est lui qui est imposé. Le rendement réel comprend les variations de valeur, réalisées ou non : une baisse du cours d'un crypto-actif compte donc, même sans cession. Il se calcule sur l'ensemble du patrimoine de la case 3, pas actif par actif. Les frais ne sont pas déductibles, à l'exception des intérêts des dettes de la case 3. Un rendement négatif est ramené à zéro et ne s'impute sur aucune autre année.",
        "Where the actual return of the year is lower than the deemed one, the actual return is taxed. It includes unrealised value changes, is computed across the whole of box 3, and costs are not deductible apart from interest on box 3 debts. A negative return is set to zero and carries to no other year.",
        "Het werkelijk rendement omvat ook ongerealiseerde waardeveranderingen.",
      ),
      includeUnrealised: true,
      deductCosts: false,
      refs: [REFS.hr2024, REFS.tegenbewijs],
    },
    income: {
      taxedAtReceipt: false,
      acquisitionCost: "MARKET",
      category: t("Rendement des « overige bezittingen » — case 3", "Return on other assets — box 3", "Overige bezittingen — box 3"),
      note: t(
        "Le staking et les airdrops reçus par un particulier ne sont pas imposés séparément : ils augmentent la position détenue au 1er janvier suivant et entrent donc dans l'assiette forfaitaire. Ils comptent en revanche intégralement dans le rendement réel de l'année de réception si la preuve contraire est invoquée.",
        "Staking and airdrops received by an individual are not separately taxed: they increase the position held on the next 1 January. They do count in full in the actual return of the year received under the counter-evidence scheme.",
      ),
      refs: [REFS.wetIB53],
    },
    businessTest: [
      t(
        "Une activité qui dépasse la gestion normale d'un patrimoine bascule en case 1, au barème progressif : le « resultaat uit overige werkzaamheden » vise notamment le minage exercé avec des moyens conséquents, le trading intensif appuyé sur du travail ou des connaissances particulières, et l'activité menée pour le compte de tiers.",
        "Activity beyond the normal management of wealth moves to box 1 at progressive rates: mining with substantial means, intensive trading resting on labour or particular knowledge, and activity carried on for others.",
      ),
      t(
        "Le critère décisif est l'existence d'un travail dont le rendement excède ce qu'un placement passif aurait produit. La détention longue, même importante, reste en case 3.",
        "The decisive criterion is labour producing a return above what passive investment would yield; long-term holding, however large, stays in box 3.",
      ),
      t(
        "L'application ne procède pas à cette qualification : elle calcule la case 3 et fournit le détail des opérations qui permet de l'argumenter.",
        "The app does not make that qualification: it computes box 3 and supplies the transaction detail needed to argue it.",
      ),
    ],
  },
  company: {
    framework: t("Titre 9 du livre 2 du Code civil néerlandais et Richtlijnen voor de jaarverslaggeving", "Book 2, title 9 of the Dutch Civil Code and the Dutch accounting guidelines", "Titel 9 Boek 2 BW / RJ"),
    chart: RGS_NL,
    assetAccountWidth: 2,
    auditFile: "XAF_NL",
    auditFileNote: t(
      "Le XML Auditfile Financieel 3.2 n'accompagne aucune déclaration : il est produit sur demande lors d'un contrôle et lors d'une reprise de dossier par un confrère.",
      "The XAF 3.2 accompanies no return: it is produced on request during an audit and when another practice takes the file over.",
    ),
    closingValuation: "WRITE_DOWN",
    closingValuationNote: t(
      "Évaluation au coût historique diminué des dépréciations, ou à la juste valeur lorsque l'actif est détenu à des fins de négociation et que l'entité a opté pour ce traitement. Le choix doit être cohérent d'un exercice à l'autre et mentionné en annexe.",
      "Historical cost less impairment, or fair value where the asset is held for trading and the entity has elected that treatment; the choice must be consistent and disclosed.",
    ),
    costMethods: ["FIFO", "AVERAGE"],
    corporateTax: [
      { label: t("Vennootschapsbelasting — jusqu'à 200 000 € de bénéfice", "Corporate income tax — up to €200,000 of profit"), rate: "0.19" },
      { label: t("Vennootschapsbelasting — au-delà", "Corporate income tax — above"), rate: "0.258" },
    ],
    refs: [REFS.bw2t9, REFS.vpb, REFS.xaf],
  },
  forms: [
    {
      name: "Aangifte inkomstenbelasting — box 3",
      label: t("Déclaration de revenus, rubrique « overige bezittingen »", "Income tax return, other assets section"),
      deadline: t("1er mai de l'année suivante ; report possible, et délai étendu pour les dossiers déposés par un conseil.", "1 May of the following year; extensions available, longer for files filed by an adviser."),
      boxes: [
        { id: "HOLDINGS", box: "Overige bezittingen", label: t("Valeur des crypto-actifs au 1er janvier", "Value of crypto-assets on 1 January") },
        { id: "EXEMPT", box: "Heffingsvrij vermogen", label: t("Capital exonéré", "Tax-free capital") },
        { id: "ACTUAL", box: "Werkelijk rendement", label: t("Rendement réel, si la preuve contraire est invoquée", "Actual return, where the counter-evidence scheme is used") },
      ],
    },
    {
      name: "Opgaaf werkelijk rendement (OWR)",
      label: t("Formulaire de preuve contraire pour les années 2024 et antérieures", "Counter-evidence form for 2024 and earlier"),
      boxes: [{ id: "OWR", box: "Werkelijk rendement", label: t("Rendement réel de l'année, variations de valeur comprises", "Actual return of the year, value changes included") }],
    },
  ],
  dac8: {
    inScope: true,
    firstReportedYear: 2026,
    note: t(
      "Les Pays-Bas transposent la directive (UE) 2023/2226. Le rapprochement est particulièrement utile ici : l'administration recevra des flux alors que la déclaration ne porte que sur un stock au 1er janvier, et l'écart entre les deux appelle une explication.",
      "The Netherlands transposes directive (EU) 2023/2226. The reconciliation matters here because the administration receives flows while the return shows only the 1 January stock.",
    ),
  },
  assumptions: [
    t(
      "L'estimation ne porte que sur les actifs numériques. L'impôt réel de la case 3 se calcule sur l'ensemble des avoirs et des dettes, avec des taux distincts pour les avoirs bancaires, et tient compte du partenaire fiscal.",
      "The estimate covers digital assets only; the real box 3 charge covers all assets and debts, with separate rates for bank balances, and takes the tax partner into account.",
    ),
    t(
      "La position au 1er janvier est reconstituée à partir des comptes importés et des avoirs externes saisis. Un actif détenu en autoconservation et non déclaré à l'application n'apparaîtra pas : c'est la première cause d'écart avec ce que l'administration recevra au titre de DAC8.",
      "The 1 January position is rebuilt from imported accounts and declared external holdings; a self-custodied asset not entered will be missing.",
    ),
    t(
      "Les crypto-actifs sont évalués au cours du 1er janvier. L'administration accepte un cours de place représentatif ; conservez la source retenue, car elle décide directement du montant déclaré.",
      "Crypto-assets are valued at the 1 January price; keep the source used, since it directly decides the amount declared.",
    ),
    t(
      "Le régime de la preuve contraire est calculé sur le seul périmètre des actifs numériques suivis ici. Pour être invoqué, il doit l'être sur l'ensemble du patrimoine de la case 3 : le chiffre produit est un élément du dossier, pas la déclaration.",
      "The counter-evidence figure covers only the digital assets tracked here; the scheme has to be invoked across the whole of box 3.",
    ),
  ],
  review: { status: "DRAFT", lastReviewed: "2026-09-16" },
  refs: Object.values(REFS),
  engine: wealthEngine,
};
