import type { ChartOfAccounts } from "@/lib/engine/chart";
import { account as a, buildChart as chart } from "./charts";

/**
 * Germany — SKR04 (DATEV Standardkontenrahmen).
 *
 * Neither SKR03 nor SKR04 contains a crypto account: DATEV expects the practice
 * to create one. The mapping below follows the classification the BMF letter of
 * 6 March 2025 imposes (Rn. 41): current-asset tokens are "sonstige
 * Vermögensgegenstände" under §266(2) B.II.4 HGB, hence the 1300 block. Every
 * number must be confirmed with the Steuerberater, which is why they are all
 * editable in the settings.
 */
export const SKR04_DE: ChartOfAccounts = chart({
  bank: a("1800", "Bank"),
  internalTransfer: a("1460", "Geldtransit"),
  exchangeFiatPrefix: "1301",
  exchangeForeignFiatPrefix: "1302",
  tokensPrefix: "1300",
  feesFiat: a("6855", "Nebenkosten des Geldverkehrs"),
  feesTrading: a("6856", "Handelsgebühren Kryptowerte"),
  feesNetwork: a("6857", "Netzwerkgebühren (on-chain)"),
  gainOnTokens: a("4905", "Erträge aus dem Abgang von Gegenständen des Umlaufvermögens"),
  lossOnTokens: a("6905", "Verluste aus dem Abgang von Gegenständen des Umlaufvermögens"),
  fxGain: a("4840", "Erträge aus Währungsumrechnung"),
  fxLoss: a("6880", "Aufwendungen aus Währungsumrechnung"),
  tokenIncome: a("4845", "Sonstige betriebliche Erträge — Staking, Lending, Airdrops"),
  suppliers: a("3300", "Verbindlichkeiten aus Lieferungen und Leistungen"),
  customers: a("1200", "Forderungen aus Lieferungen und Leistungen"),
  ownerAccount: a("1340", "Verrechnungskonto Gesellschafter"),
  miscExpense: a("6969", "Sonstige Aufwendungen"),
  miscIncome: a("4970", "Sonstige Erträge"),
  suspense: a("1370", "Durchlaufende Posten — zu klärende Vorgänge"),
  valuationLossAsset: a("7210", "Abschreibungen auf Wertpapiere und Kryptowerte des Umlaufvermögens"),
  valuationGainLiability: a("4915", "Erträge aus Zuschreibungen zum Umlaufvermögen"),
  provisionRisk: a("1309", "Wertberichtigungen auf Kryptowerte"),
  provisionCharge: a("7211", "Abschreibungen auf Kryptowerte"),
  provisionReversal: a("4916", "Zuschreibungen auf Kryptowerte"),
  fxConversionLoss: a("6881", "Währungsdifferenzen"),
  fxConversionGain: a("4841", "Währungsdifferenzen"),
  fxProvision: a("3950", "Rückstellungen für Währungsrisiken"),
  roundingExpense: a("6968", "Rundungsdifferenzen"),
  roundingIncome: a("4971", "Rundungsdifferenzen"),
});

/**
 * Austria — Einheitskontenrahmen (KFS/BW 6).
 *
 * Class 2 holds the other current assets, which is where crypto sits in the
 * normal case; classes 4 and 7 carry the operating income and expense. The EKR
 * has no crypto account either, so these are named sub-accounts by convention.
 */
export const EKR_AT: ChartOfAccounts = chart({
  bank: a("2800", "Guthaben bei Kreditinstituten"),
  internalTransfer: a("2890", "Geldtransit"),
  exchangeFiatPrefix: "2801",
  exchangeForeignFiatPrefix: "2802",
  tokensPrefix: "2830",
  feesFiat: a("7790", "Spesen des Geldverkehrs"),
  feesTrading: a("7791", "Handelsgebühren Kryptowerte"),
  feesNetwork: a("7792", "Netzwerkgebühren (on-chain)"),
  gainOnTokens: a("4600", "Erträge aus dem Abgang von Kryptowerten"),
  lossOnTokens: a("7810", "Verluste aus dem Abgang von Kryptowerten"),
  fxGain: a("4830", "Kursgewinne"),
  fxLoss: a("7830", "Kursverluste"),
  tokenIncome: a("4610", "Erträge aus Kryptowerten (Lending, Mining)"),
  suppliers: a("3300", "Verbindlichkeiten aus Lieferungen und Leistungen"),
  customers: a("2000", "Forderungen aus Lieferungen und Leistungen"),
  ownerAccount: a("2700", "Verrechnungskonto Gesellschafter"),
  miscExpense: a("7800", "Sonstige betriebliche Aufwendungen"),
  miscIncome: a("4620", "Sonstige betriebliche Erträge"),
  suspense: a("2890", "Schwebende Geldbewegungen — zu klärende Vorgänge"),
  valuationLossAsset: a("7820", "Abschreibungen auf Kryptowerte des Umlaufvermögens"),
  valuationGainLiability: a("4630", "Zuschreibungen zu Kryptowerten"),
  provisionRisk: a("2839", "Wertberichtigungen auf Kryptowerte"),
  provisionCharge: a("7821", "Dotierung Wertberichtigung Kryptowerte"),
  provisionReversal: a("4631", "Auflösung Wertberichtigung Kryptowerte"),
  fxConversionLoss: a("7831", "Währungsdifferenzen"),
  fxConversionGain: a("4831", "Währungsdifferenzen"),
  fxProvision: a("3900", "Rückstellungen für Währungsrisiken"),
  roundingExpense: a("7801", "Rundungsdifferenzen"),
  roundingIncome: a("4621", "Rundungsdifferenzen"),
});
