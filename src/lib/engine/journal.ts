import { cents, ZERO, D, formatFr, formatQty, type Decimal } from "./money";
import { isFiat, FIAT_WRAPPERS, type ValuedTx, type ValuedLeg } from "./model";
import { CostBasisLedger, type CostMethod, type AssetPosition } from "./costbasis";
import { DEFAULT_CHART, allocateAssetAccount, type ChartOfAccounts, type AssetAccountMap, type Account } from "./chart";
import type { PriceTable } from "./valuation";
import { formatZonedDate } from "./tz";

/* ------------------------------------------------------------------------ */
/* Types                                                                     */
/* ------------------------------------------------------------------------ */

export interface JournalLine {
  account: string;
  accountLabel: string;
  auxAccount?: string;
  auxLabel?: string;
  label: string;
  debit: Decimal; // rounded to cents
  credit: Decimal; // rounded to cents
  currencyAmount?: Decimal;
  currency?: string;
}

export type EntryKind = "OPERATION" | "INVENTORY" | "REVERSAL" | "ADJUSTMENT";

export interface JournalEntry {
  journalCode: string;
  journalLib: string;
  seq: number;
  num: string;
  date: Date;
  pieceRef: string;
  pieceDate: Date;
  label: string;
  lines: JournalLine[];
  txId?: string;
  kind: EntryKind;
  warnings: string[];
}

export interface RealizedGain {
  txId: string;
  date: Date;
  asset: string;
  qty: Decimal;
  proceedsEur: Decimal;
  costBasisEur: Decimal;
  gainEur: Decimal;
  kind: "DISPOSAL" | "FEE";
}

export interface EngineWarning {
  txId?: string;
  date?: Date;
  code: string;
  message: string;
  level: "warning" | "error";
}

export interface ExchangeAccountInfo {
  id: string;
  label: string;
  /** 1-based index used to derive the 5171xx account and the journal code. */
  index: number;
  journalCode?: string;
  journalLib?: string;
}

export interface InventoryLine {
  asset: string;
  qty: Decimal;
  bookValueEur: Decimal;
  marketPriceEur: Decimal | null;
  marketValueEur: Decimal | null;
  latentEur: Decimal | null;
  provisionEur: Decimal; // provision balance after closing
}

export interface JournalOptions {
  chart?: ChartOfAccounts;
  assetAccountMap?: AssetAccountMap;
  fiscalYear: { start: Date; end: Date };
  method: CostMethod;
  accounts: ExchangeAccountInfo[];
  validationDate?: Date;
  /** Positions at the opening of the fiscal year (à-nouveaux). When given, transactions before the fiscal year are ignored. */
  openingPositions?: AssetPosition[];
  /** Provision balances per asset at the previous closing. */
  previousProvisions?: Record<string, Decimal>;
  closingPrices?: PriceTable;
  generateInventory?: boolean;
  odJournal?: { code: string; lib: string };
}

export interface JournalResult {
  entries: JournalEntry[];
  /** Reversal entries dated on the first day of the following fiscal year (contre-passation des comptes 474/475). */
  reversalEntries: JournalEntry[];
  positions: Map<string, AssetPosition>;
  realized: RealizedGain[];
  warnings: EngineWarning[];
  assetAccountMap: AssetAccountMap;
  inventory: InventoryLine[];
  closingProvisions: Record<string, Decimal>;
  totals: { debit: Decimal; credit: Decimal; entries: number; lines: number };
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

const fmtDate = (d: Date): string => formatZonedDate(d);

interface DraftLine {
  account: string;
  accountLabel: string;
  label: string;
  debit?: Decimal;
  credit?: Decimal;
  currencyAmount?: Decimal;
  currency?: string;
  /** lines that may absorb rounding differences (P&L lines) */
  plug?: boolean;
}

function finalizeLines(draft: DraftLine[], chart: ChartOfAccounts, label: string): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const l of draft) {
    const debit = cents(l.debit ?? ZERO);
    const credit = cents(l.credit ?? ZERO);
    if (debit.isZero() && credit.isZero()) continue;
    lines.push({ account: l.account, accountLabel: l.accountLabel, label: l.label, debit, credit, currencyAmount: l.currencyAmount, currency: l.currency });
  }
  let diff = lines.reduce((acc, l) => acc.plus(l.debit).minus(l.credit), ZERO);
  if (!diff.isZero()) {
    // absorb rounding on a P&L line when possible, otherwise add an explicit rounding line
    const plugIdx = draft.findIndex((l) => l.plug);
    const target = plugIdx >= 0 ? lines.find((l) => l.account === draft[plugIdx].account && l.label === draft[plugIdx].label) : undefined;
    if (target && diff.abs().lte("0.05")) {
      if (!target.debit.isZero()) target.debit = target.debit.minus(diff);
      else target.credit = target.credit.plus(diff);
      if (target.debit.isNegative()) { target.credit = target.debit.abs(); target.debit = ZERO; }
      if (target.credit.isNegative()) { target.debit = target.credit.abs(); target.credit = ZERO; }
    } else {
      if (diff.gt(0)) lines.push({ account: chart.roundingIncome.number, accountLabel: chart.roundingIncome.label, label: `Arrondi – ${label}`, debit: ZERO, credit: diff });
      else lines.push({ account: chart.roundingExpense.number, accountLabel: chart.roundingExpense.label, label: `Arrondi – ${label}`, debit: diff.abs(), credit: ZERO });
    }
    diff = lines.reduce((acc, l) => acc.plus(l.debit).minus(l.credit), ZERO);
    if (!diff.isZero()) throw new Error(`Écriture déséquilibrée après arrondi: ${label} (${diff.toString()})`);
  }
  return lines;
}

/* ------------------------------------------------------------------------ */
/* Generator                                                                 */
/* ------------------------------------------------------------------------ */

export function generateJournal(valued: ValuedTx[], opts: JournalOptions): JournalResult {
  const chart = opts.chart ?? DEFAULT_CHART;
  const assetAccountMap: AssetAccountMap = { ...(opts.assetAccountMap ?? {}) };
  const warnings: EngineWarning[] = [];
  const realized: RealizedGain[] = [];
  const validationDate = opts.validationDate ?? new Date();
  const od = opts.odJournal ?? { code: "ODC", lib: "Opérations diverses – jetons" };
  const fy = opts.fiscalYear;
  const accountsById = new Map(opts.accounts.map((a) => [a.id, a]));

  const ledger = opts.openingPositions ? CostBasisLedger.fromPositions(opts.method, opts.openingPositions) : new CostBasisLedger(opts.method);

  const acc = (a: Account) => ({ account: a.number, accountLabel: a.label });
  const tokenAccount = (asset: string) => {
    const a = asset.toUpperCase();
    if (isFiat(a) || FIAT_WRAPPERS[a]) {
      const num = allocateAssetAccount(assetAccountMap, chart.exchangeForeignFiatPrefix, `FIAT:${a}`);
      return { account: num, accountLabel: `Devises sur plateforme – ${a}` };
    }
    const num = allocateAssetAccount(assetAccountMap, chart.tokensPrefix, a);
    return { account: num, accountLabel: `Jetons détenus – ${a}` };
  };
  const exchangeEurAccount = (accountId: string) => {
    const info = accountsById.get(accountId);
    const idx = String(info?.index ?? 1).padStart(2, "0");
    return { account: `${chart.exchangeFiatPrefix}${idx}`, accountLabel: `Plateforme ${info?.label ?? accountId} – solde EUR` };
  };
  const journalFor = (accountId: string) => {
    const info = accountsById.get(accountId);
    return { code: info?.journalCode ?? `CR${info?.index ?? 1}`, lib: info?.journalLib ?? `Plateforme ${info?.label ?? "crypto"}` };
  };
  const gainAccounts = (asset: string) => (isFiat(asset) || FIAT_WRAPPERS[asset] ? { gain: chart.fxGain, loss: chart.fxLoss } : { gain: chart.gainOnTokens, loss: chart.lossOnTokens });

  const drafts: { entry: Omit<JournalEntry, "seq" | "num" | "lines">; draft: DraftLine[] }[] = [];
  const entries: JournalEntry[] = [];

  // ---- primitive bookings -------------------------------------------------
  /** Acquire `qty` of asset for `value` EUR: debits the holding account (and updates the cost ledger). */
  const acquire = (tx: ValuedTx, draft: DraftLine[], leg: ValuedLeg, value: Decimal, label: string) => {
    if (leg.asset.toUpperCase() === "EUR") {
      draft.push({ ...exchangeEurAccount(tx.accountId), label, debit: value });
      return;
    }
    ledger.acquire(leg.asset, leg.amount, value, tx.timestamp, tx.id);
    draft.push({ ...tokenAccount(leg.asset), label, debit: value, currencyAmount: leg.amount, currency: leg.asset });
  };

  /** Dispose `qty` of asset for `proceeds` EUR: credits the holding account at cost and books the gain/loss. */
  const dispose = (tx: ValuedTx, draft: DraftLine[], leg: ValuedLeg, proceeds: Decimal, label: string, kind: RealizedGain["kind"], opts2: { noGain?: boolean } = {}) => {
    if (leg.asset.toUpperCase() === "EUR") {
      draft.push({ ...exchangeEurAccount(tx.accountId), label, credit: proceeds });
      return { cost: proceeds, gain: ZERO };
    }
    const res = ledger.dispose(leg.asset, leg.amount, proceeds);
    if (res.shortfallQty.gt(0)) {
      warnings.push({ txId: tx.id, date: tx.timestamp, code: "NEGATIVE_BALANCE", level: "warning", message: `${formatQty(res.shortfallQty, leg.asset)} cédés sans acquisition connue (solde négatif) – des opérations manquent probablement en amont.` });
    }
    const cost = opts2.noGain ? proceeds : res.costBasisEur;
    const gain = opts2.noGain ? ZERO : res.gainEur;
    draft.push({ ...tokenAccount(leg.asset), label, credit: cost, currencyAmount: leg.amount, currency: leg.asset });
    if (!opts2.noGain) {
      const ga = gainAccounts(leg.asset);
      if (gain.gt(0)) draft.push({ ...acc(ga.gain), label: `Plus-value sur cession de ${formatQty(leg.amount, leg.asset)}`, credit: gain, plug: true });
      else if (gain.lt(0)) draft.push({ ...acc(ga.loss), label: `Moins-value sur cession de ${formatQty(leg.amount, leg.asset)}`, debit: gain.abs(), plug: true });
      realized.push({ txId: tx.id, date: tx.timestamp, asset: leg.asset.toUpperCase(), qty: leg.amount, proceedsEur: proceeds, costBasisEur: res.costBasisEur, gainEur: gain, kind });
    }
    return { cost, gain };
  };

  /** Expense a fee leg: debit the fee account at market value and dispose of the fee asset. */
  const bookFee = (tx: ValuedTx, draft: DraftLine[], fee: ValuedLeg, feeAccount: Account) => {
    if (fee.amount.isZero()) return;
    if (fee.valueEur.isZero() && fee.priceSource === "missing") return; // already warned at valuation
    const label = `Frais ${formatQty(fee.amount, fee.asset)}`;
    draft.push({ ...acc(feeAccount), label, debit: fee.valueEur, currencyAmount: fee.asset.toUpperCase() === "EUR" ? undefined : fee.amount, currency: fee.asset.toUpperCase() === "EUR" ? undefined : fee.asset, plug: true });
    if (tx.counterparty?.kind === "BANK" && fee.asset.toUpperCase() === "EUR") {
      draft.push({ ...acc(chart.bank), label, credit: fee.valueEur });
      return;
    }
    dispose(tx, draft, fee, fee.valueEur, label, "FEE");
  };

  const pushEntry = (tx: ValuedTx, kind: EntryKind, label: string, draft: DraftLine[], journal = journalFor(tx.accountId)) => {
    if (draft.length === 0) return;
    drafts.push({
      entry: { journalCode: journal.code, journalLib: journal.lib, date: tx.timestamp, pieceRef: tx.ref ?? tx.externalId, pieceDate: tx.timestamp, label, txId: tx.id, kind, warnings: [...tx.warnings] },
      draft,
    });
  };

  // ---- main loop ----------------------------------------------------------
  const sorted = [...valued].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const matchedPairs = matchInternalTransfers(sorted);

  for (const tx of sorted) {
    if (tx.timestamp > fy.end) break;
    const inFy = tx.timestamp >= fy.start;
    if (!inFy && opts.openingPositions) continue; // opening positions already summarise the past
    for (const w of tx.warnings) if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "VALUATION", level: "warning", message: w });

    const draft: DraftLine[] = [];
    const ins = tx.legs.filter((l) => l.role === "IN");
    const outs = tx.legs.filter((l) => l.role === "OUT");
    const fees = tx.legs.filter((l) => l.role === "FEE");
    const gross = tx.grossValueEur;
    const when = fmtDate(tx.timestamp);

    switch (tx.type) {
      case "FIAT_DEPOSIT": {
        const leg = ins[0];
        if (!leg) break;
        const label = `Dépôt ${formatQty(leg.amount, leg.asset)} sur la plateforme (${tx.counterparty?.label ?? "virement"}) – ${when}`;
        const total = leg.valueEur.plus(fees.reduce((a, f) => a.plus(f.valueEur), ZERO));
        acquire(tx, draft, leg, leg.valueEur, label);
        for (const f of fees) draft.push({ ...acc(chart.feesFiat), label: `Frais de dépôt ${formatQty(f.amount, f.asset)}`, debit: f.valueEur, plug: true });
        draft.push({ ...acc(chart.internalTransfer), label, credit: total });
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
      case "FIAT_WITHDRAWAL": {
        const leg = outs[0];
        if (!leg) break;
        const label = `Retrait ${formatQty(leg.amount, leg.asset)} vers le compte bancaire – ${when}`;
        const feeTotal = fees.reduce((a, f) => a.plus(f.valueEur), ZERO);
        draft.push({ ...acc(chart.internalTransfer), label, debit: leg.valueEur });
        for (const f of fees) draft.push({ ...acc(chart.feesFiat), label: `Frais de retrait ${formatQty(f.amount, f.asset)}`, debit: f.valueEur, plug: true });
        if (leg.asset.toUpperCase() === "EUR") draft.push({ ...exchangeEurAccount(tx.accountId), label, credit: leg.valueEur.plus(feeTotal) });
        else {
          dispose(tx, draft, leg, leg.valueEur, label, "DISPOSAL");
          for (const f of fees) dispose(tx, draft, f, f.valueEur, `Frais ${formatQty(f.amount, f.asset)}`, "FEE");
        }
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
      case "TRADE": {
        const out = outs[0], inn = ins[0];
        if (!out || !inn) { warnings.push({ txId: tx.id, code: "MALFORMED", level: "error", message: "Échange sans jambe entrante/sortante" }); break; }
        const outQ = outs.length === 1 ? formatQty(out.amount, out.asset) : `${outs.length} actifs (${outs.map((l) => l.asset).join(", ")})`;
        const inQ = ins.length === 1 ? formatQty(inn.amount, inn.asset) : `${ins.length} actifs (${ins.map((l) => l.asset).join(", ")})`;
        const isBuy = out.asset.toUpperCase() === "EUR" || isFiat(out.asset);
        const isSell = inn.asset.toUpperCase() === "EUR" || isFiat(inn.asset);
        const unit = inn.amount.isZero() ? ZERO : gross.div(inn.amount);
        const unitOut = out.amount.isZero() ? ZERO : gross.div(out.amount);
        const label = isBuy && !isSell
          ? `Achat ${inQ} contre ${outQ} (1 ${inn.asset} = ${formatFr(unit, 4)} €) – ${when}`
          : isSell && !isBuy
            ? `Vente ${outQ} contre ${inQ} (1 ${out.asset} = ${formatFr(unitOut, 4)} €) – ${when}`
            : `Échange ${outQ} → ${inQ} (${formatFr(gross, 2)} €) – ${when}`;
        const feeTotal = fees.reduce((a, f) => a.plus(f.valueEur), ZERO);
        const capitalize = chart.capitalizeFees && !isSell;
        // acquisition side
        if (tx.counterparty?.kind === "BANK" && out.asset.toUpperCase() === "EUR") {
          // card purchase: money leaves the bank account directly
          acquire(tx, draft, inn, capitalize ? gross.plus(feeTotal) : gross, label);
          draft.push({ ...acc(chart.bank), label: `Paiement par carte ${formatQty(out.amount.plus(fees.filter((f) => f.asset.toUpperCase() === "EUR").reduce((a, f) => a.plus(f.amount), ZERO)), "EUR")}`, credit: gross.plus(fees.filter((f) => f.asset.toUpperCase() === "EUR").reduce((a, f) => a.plus(f.valueEur), ZERO)) });
          for (const f of fees) {
            if (f.asset.toUpperCase() === "EUR") { if (!capitalize) draft.push({ ...acc(chart.feesTrading), label: `Frais ${formatQty(f.amount, f.asset)}`, debit: f.valueEur, plug: true }); }
            else bookFee(tx, draft, f, chart.feesTrading);
          }
        } else {
          for (const l of ins) acquire(tx, draft, l, capitalize && ins.length === 1 ? l.valueEur.plus(feeTotal) : l.valueEur, label);
          for (const l of outs) dispose(tx, draft, l, l.valueEur, label, "DISPOSAL");
          for (const f of fees) {
            if (capitalize) dispose(tx, draft, f, f.valueEur, `Frais ${formatQty(f.amount, f.asset)}`, "FEE");
            else bookFee(tx, draft, f, chart.feesTrading);
          }
        }
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
      case "REWARD": {
        const leg = ins[0];
        if (!leg) break;
        const label = `${tx.category === "AIRDROP" ? "Airdrop" : "Récompense"} ${formatQty(leg.amount, leg.asset)} (${tx.note ?? "staking / earn"}) – ${when}`;
        acquire(tx, draft, leg, leg.valueEur, label);
        draft.push({ ...acc(chart.tokenIncome), label, credit: leg.valueEur, plug: true });
        for (const f of fees) bookFee(tx, draft, f, chart.feesTrading);
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
      case "CRYPTO_DEPOSIT": {
        const leg = ins[0];
        if (!leg) break;
        const q = formatQty(leg.amount, leg.asset);
        const pair = matchedPairs.get(tx.id);
        if (tx.category === "INTERNAL_TRANSFER" && pair) {
          // matched with a tracked withdrawal: nothing to book (fee booked on the sending side)
          break;
        }
        let label: string;
        switch (tx.category) {
          case "CUSTOMER_RECEIPT":
            label = `Encaissement client ${q} (${tx.counterparty?.address ?? "adresse inconnue"}) – ${when}`;
            acquire(tx, draft, leg, leg.valueEur, label);
            draft.push({ ...acc(chart.customers), label, credit: leg.valueEur, plug: true });
            break;
          case "OWNER_CONTRIBUTION":
            label = `Apport en jetons ${q} (compte courant d'associé) – ${when}`;
            acquire(tx, draft, leg, leg.valueEur, label);
            draft.push({ ...acc(chart.ownerAccount), label, credit: leg.valueEur, plug: true });
            break;
          case "STAKING_INCOME":
          case "AIRDROP":
            label = `Revenu de jetons ${q} – ${when}`;
            acquire(tx, draft, leg, leg.valueEur, label);
            draft.push({ ...acc(chart.tokenIncome), label, credit: leg.valueEur, plug: true });
            break;
          case "GIFT_RECEIVED":
          case "FOUND":
            label = `Jetons reçus ${q} – ${when}`;
            acquire(tx, draft, leg, leg.valueEur, label);
            draft.push({ ...acc(chart.miscIncome), label, credit: leg.valueEur, plug: true });
            break;
          case "INTERNAL_TRANSFER":
            label = `Transfert entrant ${q} depuis un wallet non suivi (${tx.counterparty?.address ?? "?"}) – ${when}`;
            acquire(tx, draft, leg, leg.valueEur, label);
            draft.push({ ...acc(chart.suspense), label, credit: leg.valueEur, plug: true });
            if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "UNMATCHED_TRANSFER", level: "warning", message: `Transfert interne entrant de ${q} sans retrait apparié : importez le wallet source ou qualifiez l'opération (compte 471 en attente).` });
            break;
          default:
            label = `Réception ${q} à qualifier (${tx.counterparty?.address ?? "adresse inconnue"}) – ${when}`;
            acquire(tx, draft, leg, leg.valueEur, label);
            draft.push({ ...acc(chart.suspense), label, credit: leg.valueEur, plug: true });
            if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "UNCATEGORIZED", level: "warning", message: `Dépôt de ${q} non qualifié : choisissez une catégorie (client, apport, transfert interne…). Comptabilisé en 471 en attente.` });
        }
        for (const f of fees) bookFee(tx, draft, f, chart.feesNetwork);
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
      case "CRYPTO_WITHDRAWAL": {
        const leg = outs[0];
        if (!leg) break;
        const q = formatQty(leg.amount, leg.asset);
        const pair = matchedPairs.get(tx.id);
        let label: string;
        if (tx.category === "INTERNAL_TRANSFER" && pair) {
          label = `Transfert interne ${q} vers ${tx.counterparty?.label ?? "un autre compte"} – ${when}`;
          for (const f of fees) bookFee(tx, draft, f, chart.feesNetwork);
          pushEntry(tx, "OPERATION", label, draft);
          break;
        }
        switch (tx.category) {
          case "PURCHASE_GOODS":
            label = `Paiement fournisseur en jetons ${q} (${tx.counterparty?.address ?? "?"}) – ${when}`;
            draft.push({ ...acc(chart.suppliers), label, debit: leg.valueEur });
            dispose(tx, draft, leg, leg.valueEur, label, "DISPOSAL");
            break;
          case "OWNER_WITHDRAWAL":
            label = `Retrait de jetons par l'associé ${q} – ${when}`;
            draft.push({ ...acc(chart.ownerAccount), label, debit: leg.valueEur });
            dispose(tx, draft, leg, leg.valueEur, label, "DISPOSAL");
            break;
          case "GIFT_GIVEN":
            label = `Don de jetons ${q} – ${when}`;
            draft.push({ ...acc(chart.miscExpense), label, debit: leg.valueEur });
            dispose(tx, draft, leg, leg.valueEur, label, "DISPOSAL");
            break;
          case "LOST": {
            label = `Jetons perdus ${q} (sortie à la valeur comptable) – ${when}`;
            const res = ledger.dispose(leg.asset, leg.amount, ZERO);
            draft.push({ ...acc(chart.miscExpense), label, debit: res.costBasisEur });
            draft.push({ ...tokenAccount(leg.asset), label, credit: res.costBasisEur, currencyAmount: leg.amount, currency: leg.asset });
            break;
          }
          case "INTERNAL_TRANSFER": {
            label = `Transfert sortant ${q} vers un wallet non suivi (${tx.counterparty?.address ?? "?"}) – ${when}`;
            const r = dispose(tx, draft, leg, leg.valueEur, label, "DISPOSAL", { noGain: true });
            draft.push({ ...acc(chart.suspense), label, debit: r.cost });
            if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "UNMATCHED_TRANSFER", level: "warning", message: `Transfert interne sortant de ${q} sans dépôt apparié : importez le wallet de destination ou qualifiez l'opération (compte 471 en attente).` });
            break;
          }
          default:
            label = `Envoi ${q} à qualifier (${tx.counterparty?.address ?? "adresse inconnue"}) – ${when}`;
            draft.push({ ...acc(chart.suspense), label, debit: leg.valueEur });
            dispose(tx, draft, leg, leg.valueEur, label, "DISPOSAL");
            if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "UNCATEGORIZED", level: "warning", message: `Retrait de ${q} non qualifié : choisissez une catégorie (fournisseur, transfert interne…). Comptabilisé en 471 en attente.` });
        }
        for (const f of fees) bookFee(tx, draft, f, chart.feesNetwork);
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
      case "ADJUSTMENT": {
        const leg = ins[0] ?? outs[0];
        if (!leg) break;
        const q = formatQty(leg.amount, leg.asset);
        if (leg.role === "IN") {
          const label = `Ajustement : ${q} constatés en plus (rapprochement des soldes) – ${when}`;
          acquire(tx, draft, leg, leg.valueEur, label);
          draft.push({ ...acc(chart.suspense), label, credit: leg.valueEur, plug: true });
          if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "ADJUSTMENT", level: "warning", message: `Écriture d'ajustement : ${q} présents sur la plateforme sans opération connue.` });
          pushEntry(tx, "ADJUSTMENT", label, draft, od);
        } else {
          const label = `Ajustement : ${q} constatés en moins (rapprochement des soldes) – ${when}`;
          const res = ledger.dispose(leg.asset, leg.amount, ZERO);
          draft.push({ ...acc(chart.suspense), label, debit: res.costBasisEur });
          draft.push({ ...tokenAccount(leg.asset), label, credit: res.costBasisEur, currencyAmount: leg.amount, currency: leg.asset });
          if (inFy) warnings.push({ txId: tx.id, date: tx.timestamp, code: "ADJUSTMENT", level: "warning", message: `Écriture d'ajustement : ${q} manquants sur la plateforme.` });
          pushEntry(tx, "ADJUSTMENT", label, draft, od);
        }
        break;
      }
      case "FEE": {
        const f = fees[0] ?? outs[0];
        if (!f) break;
        const label = `Frais ${formatQty(f.amount, f.asset)} (${tx.note ?? "plateforme"}) – ${when}`;
        bookFee(tx, draft, { ...f, role: "FEE" }, chart.feesTrading);
        pushEntry(tx, "OPERATION", label, draft);
        break;
      }
    }

    if (!inFy) drafts.length = 0; // before the fiscal year: ledger updated, no entries kept
  }

  // ---- inventory (écritures d'inventaire) ---------------------------------
  const inventory: InventoryLine[] = [];
  const closingProvisions: Record<string, Decimal> = {};
  const reversalDrafts: { entry: Omit<JournalEntry, "seq" | "num" | "lines">; draft: DraftLine[] }[] = [];
  const positions = ledger.snapshot();
  const prevProv = opts.previousProvisions ?? {};
  if (opts.generateInventory) {
    const closing = fy.end;
    const reversalDate = new Date(closing.getTime() + 1); // first instant of the following fiscal year
    const assetsToReview = new Set<string>([...positions.keys(), ...Object.keys(prevProv)]);
    for (const asset of [...assetsToReview].sort()) {
      if (asset === "EUR") continue;
      const pos = positions.get(asset);
      const qty = pos?.qty ?? ZERO;
      const book = pos?.totalCost ?? ZERO;
      const previous = D(prevProv[asset] ?? 0);
      const quote = opts.closingPrices?.get(asset, closing);
      if (qty.lte(0)) {
        if (previous.gt(0)) {
          const label = `Reprise de provision sur ${asset} (position soldée) – ${fmtDate(closing)}`;
          const d: DraftLine[] = [{ ...acc(chart.provisionRisk), label, debit: previous }, { ...acc(chart.provisionReversal), label, credit: previous }];
          drafts.push({ entry: { journalCode: od.code, journalLib: od.lib, date: closing, pieceRef: `INV-${asset}`, pieceDate: closing, label, kind: "INVENTORY", warnings: [] }, draft: d });
        }
        continue;
      }
      if (!quote) {
        warnings.push({ code: "CLOSING_PRICE", level: "warning", date: closing, message: `Cours de clôture manquant pour ${asset} : pas d'écriture d'inventaire.` });
        inventory.push({ asset, qty, bookValueEur: book, marketPriceEur: null, marketValueEur: null, latentEur: null, provisionEur: previous });
        if (previous.gt(0)) closingProvisions[asset] = previous;
        continue;
      }
      const market = qty.mul(quote.priceEur);
      const latent = market.minus(book);
      const holding = tokenAccount(asset);
      const isFx = isFiat(asset) || FIAT_WRAPPERS[asset] !== undefined;
      const label = `Valorisation de ${formatQty(qty, asset)} au ${fmtDate(closing)} (1 ${asset} = ${formatFr(quote.priceEur, 4)} €)`;
      const d: DraftLine[] = [];
      const rd: DraftLine[] = [];
      let provision = ZERO;
      if (cents(latent).gt(0)) {
        d.push({ ...holding, label: `Gain latent – ${label}`, debit: latent, currencyAmount: qty, currency: asset });
        d.push({ ...acc(isFx ? chart.fxConversionGain : chart.valuationGainLiability), label: `Gain latent – ${label}`, credit: latent, plug: true });
        rd.push({ ...acc(isFx ? chart.fxConversionGain : chart.valuationGainLiability), label: `Contre-passation – ${label}`, debit: latent, plug: true });
        rd.push({ ...holding, label: `Contre-passation – ${label}`, credit: latent, currencyAmount: qty, currency: asset });
      } else if (cents(latent).lt(0)) {
        const loss = latent.abs();
        d.push({ ...acc(isFx ? chart.fxConversionLoss : chart.valuationLossAsset), label: `Perte latente – ${label}`, debit: loss, plug: true });
        d.push({ ...holding, label: `Perte latente – ${label}`, credit: loss, currencyAmount: qty, currency: asset });
        rd.push({ ...holding, label: `Contre-passation – ${label}`, debit: loss, currencyAmount: qty, currency: asset });
        rd.push({ ...acc(isFx ? chart.fxConversionLoss : chart.valuationLossAsset), label: `Contre-passation – ${label}`, credit: loss, plug: true });
        provision = cents(loss);
      }
      // provision for latent loss (art. 619-12): adjust to the new target
      const provAcc = isFx ? chart.fxProvision : chart.provisionRisk;
      if (provision.gt(previous)) {
        const dot = provision.minus(previous);
        d.push({ ...acc(chart.provisionCharge), label: `Dotation provision pour perte latente sur ${asset}`, debit: dot });
        d.push({ ...acc(provAcc), label: `Dotation provision pour perte latente sur ${asset}`, credit: dot });
      } else if (provision.lt(previous)) {
        const rep = previous.minus(provision);
        d.push({ ...acc(provAcc), label: `Reprise provision pour perte latente sur ${asset}`, debit: rep });
        d.push({ ...acc(chart.provisionReversal), label: `Reprise provision pour perte latente sur ${asset}`, credit: rep });
      }
      if (provision.gt(0)) closingProvisions[asset] = provision;
      inventory.push({ asset, qty, bookValueEur: book, marketPriceEur: quote.priceEur, marketValueEur: market, latentEur: latent, provisionEur: provision });
      if (d.length > 0) drafts.push({ entry: { journalCode: od.code, journalLib: od.lib, date: closing, pieceRef: `INV-${asset}-${fmtDate(closing).replace(/\//g, "")}`, pieceDate: closing, label, kind: "INVENTORY", warnings: [] }, draft: d });
      if (rd.length > 0) reversalDrafts.push({ entry: { journalCode: od.code, journalLib: od.lib, date: reversalDate, pieceRef: `EXT-${asset}-${fmtDate(reversalDate).replace(/\//g, "")}`, pieceDate: reversalDate, label: `Extourne – ${label}`, kind: "REVERSAL", warnings: [] }, draft: rd });
    }
  } else {
    for (const [asset, pos] of positions) {
      if (asset === "EUR") continue;
      inventory.push({ asset, qty: pos.qty, bookValueEur: pos.totalCost, marketPriceEur: null, marketValueEur: null, latentEur: null, provisionEur: D(prevProv[asset] ?? 0) });
    }
  }

  // ---- numbering ----------------------------------------------------------
  const seqByJournal = new Map<string, number>();
  const stableSorted = drafts.map((d, i) => ({ d, i })).sort((a, b) => a.d.entry.date.getTime() - b.d.entry.date.getTime() || a.i - b.i);
  for (const { d } of stableSorted) {
    const lines = finalizeLines(d.draft, chart, d.entry.label);
    if (lines.length === 0) continue;
    const seq = (seqByJournal.get(d.entry.journalCode) ?? 0) + 1;
    seqByJournal.set(d.entry.journalCode, seq);
    entries.push({ ...d.entry, seq, num: String(seq).padStart(6, "0"), lines });
  }
  const reversalEntries: JournalEntry[] = reversalDrafts.map((d, i) => ({ ...d.entry, seq: i + 1, num: String(i + 1).padStart(6, "0"), lines: finalizeLines(d.draft, chart, d.entry.label) }));

  const totals = entries.reduce(
    (acc, e) => {
      for (const l of e.lines) { acc.debit = acc.debit.plus(l.debit); acc.credit = acc.credit.plus(l.credit); acc.lines++; }
      acc.entries++;
      return acc;
    },
    { debit: ZERO, credit: ZERO, entries: 0, lines: 0 },
  );
  void validationDate;
  return { entries, reversalEntries, positions, realized, warnings, assetAccountMap, inventory, closingProvisions, totals };
}

/* ------------------------------------------------------------------------ */
/* Internal transfer matching                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Pairs a CRYPTO_WITHDRAWAL with a CRYPTO_DEPOSIT of the same asset from another
 * tracked account (same tx hash, or same quantity within 36 h). Both sides are
 * flagged INTERNAL_TRANSFER and linked; the fee stays on the sending side.
 */
export function matchInternalTransfers(sorted: ValuedTx[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const deposits = sorted.filter((t) => t.type === "CRYPTO_DEPOSIT");
  const used = new Set<string>();
  for (const w of sorted) {
    if (w.type !== "CRYPTO_WITHDRAWAL") continue;
    const out = w.legs.find((l) => l.role === "OUT");
    if (!out) continue;
    const hash = w.counterparty?.txHash?.toLowerCase();
    const candidate = deposits.find((d) => {
      if (used.has(d.id) || d.accountId === w.accountId) return false;
      const inn = d.legs.find((l) => l.role === "IN");
      if (!inn || inn.asset.toUpperCase() !== out.asset.toUpperCase()) return false;
      if (hash && d.counterparty?.txHash && d.counterparty.txHash.toLowerCase() === hash) return true;
      const dt = d.timestamp.getTime() - w.timestamp.getTime();
      if (dt < -60 * 60 * 1000 || dt > 36 * 60 * 60 * 1000) return false;
      const diff = inn.amount.minus(out.amount).abs();
      return diff.lte(out.amount.mul("0.01").plus("0.00000001"));
    });
    if (candidate) {
      used.add(candidate.id);
      pairs.set(w.id, candidate.id);
      pairs.set(candidate.id, w.id);
      w.category = "INTERNAL_TRANSFER";
      candidate.category = "INTERNAL_TRANSFER";
      w.counterparty = { ...(w.counterparty ?? { kind: "SELF" }), kind: "SELF" };
      candidate.counterparty = { ...(candidate.counterparty ?? { kind: "SELF" }), kind: "SELF" };
    }
  }
  return pairs;
}
