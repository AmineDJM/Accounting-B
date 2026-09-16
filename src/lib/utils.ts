import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtDate = (d: Date | string, withTime = false): string => {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(date);
};

export const fmtEur = (v: number | string, decimals = 2): string =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(v));

export const fmtNum = (v: number | string, max = 8): string => {
  const n = Number(v);
  const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 4 : max;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n);
};

export const fmtPct = (v: number, digits = 1): string => `${(v * 100).toFixed(digits).replace(".", ",")} %`;

export const TX_TYPE_LABELS: Record<string, string> = {
  TRADE: "Échange",
  FIAT_DEPOSIT: "Dépôt fiat",
  FIAT_WITHDRAWAL: "Retrait fiat",
  CRYPTO_DEPOSIT: "Réception crypto",
  CRYPTO_WITHDRAWAL: "Envoi crypto",
  REWARD: "Récompense",
  ADJUSTMENT: "Ajustement",
  FEE: "Frais",
};

export const CATEGORY_LABELS: Record<string, string> = {
  TRADE: "Échange d'actifs",
  BANK_TRANSFER: "Virement bancaire",
  INTERNAL_TRANSFER: "Transfert interne (mes wallets)",
  PURCHASE_GOODS: "Paiement fournisseur / achat",
  CUSTOMER_RECEIPT: "Encaissement client",
  OWNER_CONTRIBUTION: "Apport de l'associé",
  OWNER_WITHDRAWAL: "Retrait par l'associé",
  STAKING_INCOME: "Revenu (staking, earn, cashback)",
  AIRDROP: "Airdrop / distribution",
  GIFT_RECEIVED: "Don reçu",
  GIFT_GIVEN: "Don effectué",
  LOST: "Jetons perdus",
  FOUND: "Jetons retrouvés",
  UNKNOWN: "À qualifier",
};

export const CATEGORY_OPTIONS_DEPOSIT = ["INTERNAL_TRANSFER", "CUSTOMER_RECEIPT", "OWNER_CONTRIBUTION", "STAKING_INCOME", "AIRDROP", "GIFT_RECEIVED", "FOUND", "UNKNOWN"] as const;
export const CATEGORY_OPTIONS_WITHDRAWAL = ["INTERNAL_TRANSFER", "PURCHASE_GOODS", "OWNER_WITHDRAWAL", "GIFT_GIVEN", "LOST", "UNKNOWN"] as const;
