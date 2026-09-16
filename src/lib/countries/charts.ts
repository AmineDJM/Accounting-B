import type { ChartOfAccounts } from "@/lib/engine/chart";

/**
 * Charts of accounts per framework.
 *
 * Only France has a standard-setter that published dedicated accounts for
 * tokens (ANC regulation 2018-07, accounts 522, 6674/7674, 4742/4752). Every
 * other mapping below is a *proposal*: it places crypto-assets in the line of
 * the national chart that matches their nature, and every number stays editable
 * in the settings so a practice can align it with its own plan. The app never
 * claims these numbers are prescribed by law.
 */
type Account = { number: string; label: string };
const a = (number: string, label: string): Account => ({ number, label });

interface ChartInput {
  bank: Account; internalTransfer: Account; exchangeFiatPrefix: string; exchangeForeignFiatPrefix: string; tokensPrefix: string;
  feesFiat: Account; feesTrading: Account; feesNetwork: Account;
  gainOnTokens: Account; lossOnTokens: Account; fxGain: Account; fxLoss: Account; tokenIncome: Account;
  suppliers: Account; customers: Account; ownerAccount: Account;
  miscExpense: Account; miscIncome: Account; suspense: Account;
  valuationLossAsset: Account; valuationGainLiability: Account;
  provisionRisk: Account; provisionCharge: Account; provisionReversal: Account;
  fxConversionLoss: Account; fxConversionGain: Account; fxProvision: Account;
  roundingExpense: Account; roundingIncome: Account;
}

const chart = (c: ChartInput): ChartOfAccounts => ({ ...c, capitalizeFees: false });

/** Spain — Plan General de Contabilidad (RD 1514/2007). */
export const PGC_ES = chart({
  bank: a("572000", "Bancos e instituciones de crédito c/c vista, euros"),
  internalTransfer: a("555000", "Partidas pendientes de aplicación — traspasos"),
  exchangeFiatPrefix: "5720",
  exchangeForeignFiatPrefix: "5721",
  tokensPrefix: "549",
  feesFiat: a("626000", "Servicios bancarios y similares"),
  feesTrading: a("626100", "Comisiones de plataformas de criptoactivos"),
  feesNetwork: a("626200", "Comisiones de red (on-chain)"),
  gainOnTokens: a("766000", "Beneficios en participaciones y valores representativos de deuda"),
  lossOnTokens: a("666000", "Pérdidas en participaciones y valores representativos de deuda"),
  fxGain: a("768000", "Diferencias positivas de cambio"),
  fxLoss: a("668000", "Diferencias negativas de cambio"),
  tokenIncome: a("769000", "Otros ingresos financieros — recompensas en criptoactivos"),
  suppliers: a("400000", "Proveedores"),
  customers: a("430000", "Clientes"),
  ownerAccount: a("551000", "Cuenta corriente con socios y administradores"),
  miscExpense: a("678000", "Gastos excepcionales"),
  miscIncome: a("778000", "Ingresos excepcionales"),
  suspense: a("555900", "Partidas pendientes de aplicación — operaciones por clasificar"),
  valuationLossAsset: a("698000", "Pérdidas por deterioro de participaciones y valores a corto plazo"),
  valuationGainLiability: a("798000", "Reversión del deterioro de participaciones y valores a corto plazo"),
  provisionRisk: a("593000", "Deterioro de valor de criptoactivos"),
  provisionCharge: a("698100", "Dotación al deterioro de criptoactivos"),
  provisionReversal: a("798100", "Reversión del deterioro de criptoactivos"),
  fxConversionLoss: a("668100", "Diferencias negativas de cambio — conversión"),
  fxConversionGain: a("768100", "Diferencias positivas de cambio — conversión"),
  fxProvision: a("593100", "Deterioro por diferencias de cambio"),
  roundingExpense: a("659000", "Otras pérdidas en gestión corriente — redondeos"),
  roundingIncome: a("759000", "Ingresos por servicios diversos — redondeos"),
});

/** Portugal — Sistema de Normalização Contabilística (SNC). */
export const SNC_PT = chart({
  bank: a("12", "Depósitos à ordem"),
  internalTransfer: a("13", "Outros depósitos bancários — transferências internas"),
  exchangeFiatPrefix: "121",
  exchangeForeignFiatPrefix: "122",
  tokensPrefix: "142",
  feesFiat: a("6288", "Outros fornecimentos e serviços — comissões bancárias"),
  feesTrading: a("6881", "Comissões de plataformas de criptoativos"),
  feesNetwork: a("6882", "Comissões de rede (on-chain)"),
  gainOnTokens: a("7885", "Outros rendimentos — ganhos na alienação de criptoativos"),
  lossOnTokens: a("6885", "Outros gastos — perdas na alienação de criptoativos"),
  fxGain: a("7861", "Diferenças de câmbio favoráveis"),
  fxLoss: a("6861", "Diferenças de câmbio desfavoráveis"),
  tokenIncome: a("7886", "Outros rendimentos — recompensas em criptoativos"),
  suppliers: a("221", "Fornecedores c/c"),
  customers: a("211", "Clientes c/c"),
  ownerAccount: a("268", "Outras operações com sócios"),
  miscExpense: a("6888", "Outros gastos e perdas"),
  miscIncome: a("7888", "Outros rendimentos e ganhos"),
  suspense: a("278", "Outros devedores e credores — operações a classificar"),
  valuationLossAsset: a("6531", "Perdas por imparidade em criptoativos"),
  valuationGainLiability: a("7631", "Reversões de perdas por imparidade em criptoativos"),
  provisionRisk: a("149", "Perdas por imparidade acumuladas — criptoativos"),
  provisionCharge: a("6532", "Perdas por imparidade do período"),
  provisionReversal: a("7632", "Reversões de perdas por imparidade"),
  fxConversionLoss: a("6862", "Diferenças de câmbio — conversão"),
  fxConversionGain: a("7862", "Diferenças de câmbio — conversão"),
  fxProvision: a("2989", "Provisões — diferenças de câmbio"),
  roundingExpense: a("6889", "Arredondamentos"),
  roundingIncome: a("7889", "Arredondamentos"),
});

/** Belgium — Plan comptable minimum normalisé (PCMN, AR du 12 septembre 1983). */
export const PCMN_BE = chart({
  bank: a("550000", "Établissements de crédit — comptes courants"),
  internalTransfer: a("580000", "Virements internes"),
  exchangeFiatPrefix: "5501",
  exchangeForeignFiatPrefix: "5502",
  tokensPrefix: "414",
  feesFiat: a("656000", "Frais financiers divers — frais de transfert"),
  feesTrading: a("656100", "Commissions sur opérations de crypto-actifs"),
  feesNetwork: a("656200", "Frais de réseau (on-chain)"),
  gainOnTokens: a("752000", "Plus-values sur réalisation d'actifs circulants"),
  lossOnTokens: a("652000", "Moins-values sur réalisation d'actifs circulants"),
  fxGain: a("754000", "Différences de change positives"),
  fxLoss: a("654000", "Différences de change négatives"),
  tokenIncome: a("751000", "Produits des actifs circulants — récompenses en jetons"),
  suppliers: a("440000", "Fournisseurs"),
  customers: a("400000", "Clients"),
  ownerAccount: a("489000", "Autres dettes — compte courant de l'associé"),
  miscExpense: a("664000", "Charges exceptionnelles diverses"),
  miscIncome: a("764000", "Produits exceptionnels divers"),
  suspense: a("499000", "Comptes d'attente"),
  valuationLossAsset: a("651000", "Réductions de valeur sur autres créances — dotations"),
  valuationGainLiability: a("651100", "Réductions de valeur sur autres créances — reprises"),
  provisionRisk: a("414900", "Réductions de valeur actées sur crypto-actifs"),
  provisionCharge: a("651000", "Dotations aux réductions de valeur"),
  provisionReversal: a("651100", "Reprises de réductions de valeur"),
  fxConversionLoss: a("654100", "Différences de change — conversion"),
  fxConversionGain: a("754100", "Différences de change — conversion"),
  fxProvision: a("163000", "Provisions pour risques de change"),
  roundingExpense: a("640000", "Charges d'exploitation diverses — arrondis"),
  roundingIncome: a("744000", "Produits d'exploitation divers — arrondis"),
});

/** Switzerland — plan comptable PME (Kontenrahmen KMU, Sterchi). */
export const KMU_CH = chart({
  bank: a("1020", "Banque / Bankguthaben"),
  internalTransfer: a("1090", "Compte de transfert / Transferkonto"),
  exchangeFiatPrefix: "1021",
  exchangeForeignFiatPrefix: "1022",
  tokensPrefix: "106",
  feesFiat: a("6940", "Frais bancaires / Bankspesen"),
  feesTrading: a("6941", "Commissions de plateformes de crypto-actifs"),
  feesNetwork: a("6942", "Frais de réseau (on-chain)"),
  gainOnTokens: a("6950", "Produit financier / Finanzertrag — gains sur crypto-actifs"),
  lossOnTokens: a("6900", "Charge financière / Finanzaufwand — pertes sur crypto-actifs"),
  fxGain: a("6952", "Gains de change / Kursgewinne"),
  fxLoss: a("6902", "Pertes de change / Kursverluste"),
  tokenIncome: a("6951", "Produit financier — récompenses en jetons"),
  suppliers: a("2000", "Créanciers / Verbindlichkeiten aus Lieferungen und Leistungen"),
  customers: a("1100", "Débiteurs / Forderungen aus Lieferungen und Leistungen"),
  ownerAccount: a("2850", "Compte privé / Privatkonto"),
  miscExpense: a("6800", "Charges diverses / Übriger Aufwand"),
  miscIncome: a("6805", "Produits divers / Übriger Ertrag"),
  suspense: a("1099", "Compte d'attente / Unklare Beträge"),
  valuationLossAsset: a("6901", "Correction de valeur sur crypto-actifs"),
  valuationGainLiability: a("6953", "Reprise de correction de valeur sur crypto-actifs"),
  provisionRisk: a("1069", "Corrections de valeur sur titres et crypto-actifs"),
  provisionCharge: a("6903", "Dotation aux corrections de valeur"),
  provisionReversal: a("6954", "Dissolution de corrections de valeur"),
  fxConversionLoss: a("6904", "Différences de conversion"),
  fxConversionGain: a("6955", "Différences de conversion"),
  fxProvision: a("2330", "Provisions à court terme — risques de change"),
  roundingExpense: a("6801", "Différences d'arrondi"),
  roundingIncome: a("6806", "Différences d'arrondi"),
});

/** Italy — piano dei conti aligned with the OIC balance-sheet captions. */
export const OIC_IT = chart({
  bank: a("182000", "Banche c/c attivi"),
  internalTransfer: a("189000", "Trasferimenti interni di liquidità"),
  exchangeFiatPrefix: "1821",
  exchangeForeignFiatPrefix: "1822",
  tokensPrefix: "175",
  feesFiat: a("714000", "Oneri bancari"),
  feesTrading: a("714100", "Commissioni su operazioni in cripto-attività"),
  feesNetwork: a("714200", "Commissioni di rete (on-chain)"),
  gainOnTokens: a("830000", "Proventi da alienazione di cripto-attività"),
  lossOnTokens: a("730000", "Oneri da alienazione di cripto-attività"),
  fxGain: a("831000", "Utili su cambi"),
  fxLoss: a("731000", "Perdite su cambi"),
  tokenIncome: a("832000", "Altri proventi finanziari — remunerazioni in cripto-attività"),
  suppliers: a("201000", "Debiti verso fornitori"),
  customers: a("101000", "Crediti verso clienti"),
  ownerAccount: a("209000", "Conto corrente soci"),
  miscExpense: a("750000", "Oneri diversi di gestione"),
  miscIncome: a("850000", "Proventi diversi di gestione"),
  suspense: a("199000", "Partite da classificare"),
  valuationLossAsset: a("735000", "Svalutazione di cripto-attività"),
  valuationGainLiability: a("835000", "Ripristino di valore di cripto-attività"),
  provisionRisk: a("179000", "Fondo svalutazione cripto-attività"),
  provisionCharge: a("735100", "Accantonamento al fondo svalutazione"),
  provisionReversal: a("835100", "Utilizzo del fondo svalutazione"),
  fxConversionLoss: a("731100", "Differenze di conversione"),
  fxConversionGain: a("831100", "Differenze di conversione"),
  fxProvision: a("259000", "Fondo rischi su cambi"),
  roundingExpense: a("750900", "Arrotondamenti passivi"),
  roundingIncome: a("850900", "Arrotondamenti attivi"),
});

/** Gulf states and any IFRS filer without a national chart. */
export const IFRS_GENERIC = chart({
  bank: a("101000", "Cash and cash equivalents — bank"),
  internalTransfer: a("109000", "Internal transfers"),
  exchangeFiatPrefix: "1011",
  exchangeForeignFiatPrefix: "1012",
  tokensPrefix: "115",
  feesFiat: a("610000", "Bank and transfer charges"),
  feesTrading: a("610100", "Exchange trading fees"),
  feesNetwork: a("610200", "Network (on-chain) fees"),
  gainOnTokens: a("710000", "Gain on disposal of crypto-assets"),
  lossOnTokens: a("620000", "Loss on disposal of crypto-assets"),
  fxGain: a("711000", "Foreign exchange gain"),
  fxLoss: a("621000", "Foreign exchange loss"),
  tokenIncome: a("712000", "Income from crypto-assets (staking, rewards)"),
  suppliers: a("201000", "Trade payables"),
  customers: a("102000", "Trade receivables"),
  ownerAccount: a("301000", "Shareholder current account"),
  miscExpense: a("690000", "Other expenses"),
  miscIncome: a("790000", "Other income"),
  suspense: a("199000", "Suspense — unclassified transactions"),
  valuationLossAsset: a("622000", "Impairment of crypto-assets"),
  valuationGainLiability: a("713000", "Reversal of impairment / revaluation of crypto-assets"),
  provisionRisk: a("119000", "Accumulated impairment — crypto-assets"),
  provisionCharge: a("622100", "Impairment charge"),
  provisionReversal: a("713100", "Impairment reversal"),
  fxConversionLoss: a("621100", "Translation differences"),
  fxConversionGain: a("711100", "Translation differences"),
  fxProvision: a("209000", "Provision for currency risk"),
  roundingExpense: a("690900", "Rounding differences"),
  roundingIncome: a("790900", "Rounding differences"),
});

export { chart as buildChart, a as account };

/**
 * Netherlands — Referentiegrootboekschema (RGS), the reference chart the Dutch
 * tax authority and the accounting software vendors share. Crypto-assets sit in
 * the financial fixed assets or, for a trading position, under the securities
 * of the current assets; the numbers below follow the RGS decimal layout.
 */
export const RGS_NL = chart({
  bank: a("102010", "Bankrekeningen — rekening-courant"),
  internalTransfer: a("103010", "Kruisposten"),
  exchangeFiatPrefix: "1021",
  exchangeForeignFiatPrefix: "1022",
  tokensPrefix: "115",
  feesFiat: a("430120", "Bankkosten"),
  feesTrading: a("430130", "Transactiekosten cryptoactiva"),
  feesNetwork: a("430140", "Netwerkkosten (on-chain)"),
  gainOnTokens: a("845010", "Opbrengst van vorderingen en effecten — cryptoactiva"),
  lossOnTokens: a("845020", "Waardeverminderingen van effecten — cryptoactiva"),
  fxGain: a("845030", "Valutakoersverschillen — winst"),
  fxLoss: a("845040", "Valutakoersverschillen — verlies"),
  tokenIncome: a("845050", "Overige financiële baten — staking en rewards"),
  suppliers: a("160010", "Crediteuren"),
  customers: a("130010", "Debiteuren"),
  ownerAccount: a("175010", "Rekening-courant directie"),
  miscExpense: a("470010", "Overige bedrijfskosten"),
  miscIncome: a("840010", "Overige bedrijfsopbrengsten"),
  suspense: a("109010", "Tussenrekening — nog te classificeren"),
  valuationLossAsset: a("115900", "Waardevermindering cryptoactiva"),
  valuationGainLiability: a("115910", "Terugneming waardevermindering cryptoactiva"),
  provisionRisk: a("155010", "Voorziening waardevermindering cryptoactiva"),
  provisionCharge: a("845060", "Dotatie voorziening cryptoactiva"),
  provisionReversal: a("845070", "Vrijval voorziening cryptoactiva"),
  fxConversionLoss: a("845080", "Omrekeningsverschillen — verlies"),
  fxConversionGain: a("845090", "Omrekeningsverschillen — winst"),
  fxProvision: a("155020", "Voorziening valutarisico"),
  roundingExpense: a("470020", "Afrondingsverschillen — kosten"),
  roundingIncome: a("840020", "Afrondingsverschillen — opbrengsten"),
});
