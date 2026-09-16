/**
 * Chart of accounts (plan de comptes) used to book crypto operations under the
 * French PCG as amended for tokens (règlement ANC 2018-07, consolidated in the
 * PCG 2025: articles 619-10 to 619-17).
 *
 * Everything here is a default: entities can override any number/label.
 */
export interface ChartOfAccounts {
  bank: Account; // 512
  internalTransfer: Account; // 580 – virements internes (bank <-> exchange)
  exchangeFiatPrefix: string; // 5171xx – EUR balance held at the exchange (PSAN/CASP)
  exchangeForeignFiatPrefix: string; // 5172xx – other fiat balances held at the exchange
  tokensPrefix: string; // 522xxx – jetons détenus (art. 619-12)
  feesFiat: Account; // 62781 – frais sur dépôts / retraits fiat
  feesTrading: Account; // 62782 – commissions de la plateforme
  feesNetwork: Account; // 62783 – frais de réseau (on-chain)
  gainOnTokens: Account; // 7674 – produits nets sur cessions de jetons (art. 619-15)
  lossOnTokens: Account; // 6674 – charges nettes sur cessions de jetons (art. 619-15)
  fxGain: Account; // 766
  fxLoss: Account; // 666
  tokenIncome: Account; // 768x – staking / earn / airdrops
  suppliers: Account; // 401
  customers: Account; // 411
  ownerAccount: Account; // 455
  miscExpense: Account; // 6588 – jetons perdus / donnés
  miscIncome: Account; // 7588 – jetons trouvés / reçus
  suspense: Account; // 471 – opérations à qualifier
  valuationLossAsset: Account; // 4742 – différences d'évaluation de jetons détenus – actif
  valuationGainLiability: Account; // 4752 – différences d'évaluation de jetons détenus – passif
  provisionRisk: Account; // 1518x – provision pour pertes latentes sur jetons (art. 619-12)
  provisionCharge: Account; // 6865
  provisionReversal: Account; // 7865
  fxConversionLoss: Account; // 476 – différences de conversion – actif (devises)
  fxConversionGain: Account; // 477 – différences de conversion – passif (devises)
  fxProvision: Account; // 1515 – provisions pour pertes de change
  roundingExpense: Account; // 658
  roundingIncome: Account; // 758
  /** Fees are expensed by default; set to true to include them in the acquisition cost of tokens. */
  capitalizeFees: boolean;
}

export interface Account {
  number: string;
  label: string;
}

export const DEFAULT_CHART: ChartOfAccounts = {
  bank: { number: "512000", label: "Banque" },
  internalTransfer: { number: "580000", label: "Virements internes" },
  exchangeFiatPrefix: "5171",
  exchangeForeignFiatPrefix: "5172",
  tokensPrefix: "522",
  feesFiat: { number: "627810", label: "Frais sur dépôts et retraits fiat" },
  feesTrading: { number: "627820", label: "Commissions sur opérations d'échange de jetons" },
  feesNetwork: { number: "627830", label: "Frais de réseau (transferts on-chain)" },
  gainOnTokens: { number: "767400", label: "Produits nets sur cessions de jetons" },
  lossOnTokens: { number: "667400", label: "Charges nettes sur cessions de jetons" },
  fxGain: { number: "766000", label: "Gains de change" },
  fxLoss: { number: "666000", label: "Pertes de change" },
  tokenIncome: { number: "768100", label: "Revenus de jetons (staking, earn, airdrops)" },
  suppliers: { number: "401000", label: "Fournisseurs" },
  customers: { number: "411000", label: "Clients" },
  ownerAccount: { number: "455000", label: "Associés – comptes courants" },
  miscExpense: { number: "658800", label: "Charges diverses de gestion courante" },
  miscIncome: { number: "758800", label: "Produits divers de gestion courante" },
  suspense: { number: "471000", label: "Compte d'attente – opérations à qualifier" },
  valuationLossAsset: { number: "474200", label: "Différences d'évaluation de jetons détenus – Actif" },
  valuationGainLiability: { number: "475200", label: "Différences d'évaluation de jetons détenus – Passif" },
  provisionRisk: { number: "151850", label: "Provisions pour pertes latentes sur jetons" },
  provisionCharge: { number: "686500", label: "Dotations aux provisions pour risques financiers" },
  provisionReversal: { number: "786500", label: "Reprises sur provisions pour risques financiers" },
  fxConversionLoss: { number: "476000", label: "Différences de conversion – Actif" },
  fxConversionGain: { number: "477000", label: "Différences de conversion – Passif" },
  fxProvision: { number: "151500", label: "Provisions pour pertes de change" },
  roundingExpense: { number: "658000", label: "Charges diverses de gestion courante – arrondis" },
  roundingIncome: { number: "758000", label: "Produits divers de gestion courante – arrondis" },
  capitalizeFees: false,
};

/**
 * Stable allocation of sub-accounts per asset (522001 = BTC, 522002 = ETH…).
 * The map is persisted with the entity so numbers never change once assigned.
 */
export type AssetAccountMap = Record<string, string>;

export function allocateAssetAccount(map: AssetAccountMap, prefix: string, asset: string, width = 3): string {
  const key = asset.toUpperCase();
  if (map[key]) return map[key];
  const used = new Set(Object.values(map));
  for (let i = 1; i < 10 ** width; i++) {
    const candidate = `${prefix}${String(i).padStart(width, "0")}`;
    if (!used.has(candidate)) {
      map[key] = candidate;
      return candidate;
    }
  }
  throw new Error(`No free sub-account under ${prefix}`);
}

export function padAccount(n: string, length = 6): string {
  return n.length >= length ? n : n.padEnd(length, "0");
}
