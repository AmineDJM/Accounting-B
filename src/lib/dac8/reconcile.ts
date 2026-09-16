import { D, ZERO, cents, Decimal } from "@/lib/engine/money";
import { count as countVal, money, qty as qtyVal, step, text } from "@/lib/engine/trace";
import type { ComputedAggregates, ComputedBucket } from "./aggregate";
import { BUCKET_LABELS, DAC8_REFS, DISPOSAL_BUCKETS, type Dac8Bucket, type Dac8Statement, type ReconciliationLine, type ReconciliationResult } from "./types";

/**
 * Compares what a provider reported to the tax administration with what the
 * app computed from the same account.
 *
 * The point is not to decide who is right: the provider aggregates its own
 * order book while the app rebuilds the taxpayer's position across every
 * account and wallet. The point is to surface each divergence, quantify it and
 * name its likely cause, so that the divergence is explained in the file
 * before the administration asks.
 */
export interface ReconcileOptions {
  /** Relative tolerance on amounts before a difference is flagged (default 1 %). */
  amountTolerance?: number;
  /** Relative tolerance on quantities (default 0,5 %). */
  unitTolerance?: number;
  /** Absolute floor below which a difference is ignored, in the statement currency. */
  amountFloor?: string;
}

export function reconcileDac8(statement: Dac8Statement, computed: ComputedAggregates, opts: ReconcileOptions = {}): ReconciliationResult {
  const amountTol = opts.amountTolerance ?? 0.01;
  const unitTol = opts.unitTolerance ?? 0.005;
  const floor = D(opts.amountFloor ?? "1");
  const cur = statement.currency;
  const lines: ReconciliationLine[] = [];

  /** True when the statement matches the fee treatment the app did not use. */
  const matchesOtherTreatment = (amount: Decimal | null, c: ComputedBucket | undefined): boolean => {
    if (!amount || !c || c.fees.lte(0)) return false;
    const other = computed.feeTreatment === "NET" ? c.amountGross : c.amountNet;
    return amount.minus(other).abs().lte(Decimal.max(other.mul("0.0005"), D("0.02")));
  };

  const keys = new Set<string>();
  for (const l of statement.lines) keys.add(`${l.asset}|${l.bucket}`);
  for (const b of computed.buckets) keys.add(`${b.asset}|${b.bucket}`);

  for (const key of [...keys].sort()) {
    const [asset, bucketRaw] = key.split("|");
    const bucket = bucketRaw as Dac8Bucket;
    const s = statement.lines.find((l) => l.asset === asset && l.bucket === bucket) ?? null;
    const c = computed.buckets.find((b) => b.asset === asset && b.bucket === bucket);
    const computedSide = { count: c?.count ?? 0, units: c?.units ?? ZERO, amount: c?.amount ?? ZERO };
    // TransferWallet carries no NumberofTransactions element, so a count
    // comparison on that bucket would always read as a difference.
    const deltaCount = bucket === "TransferWallet" || s?.count === null || s?.count === undefined ? null : s.count - computedSide.count;
    const deltaUnits = s?.units ? s.units.minus(computedSide.units) : null;
    const deltaAmount = s?.amount ? s.amount.minus(computedSide.amount) : null;

    let status: ReconciliationLine["status"] = "MATCH";
    let explanation = "Le relevé du prestataire et le calcul de l'application concordent.";

    if (!s && computedSide.count > 0) {
      status = "MISSING_IN_STATEMENT";
      explanation = bucket === "TransferWallet"
        ? "Le prestataire ne distingue pas les transferts vers une adresse qu'il ne rattache pas à un prestataire, ou ne les a pas déclarés. Conservez la preuve que l'adresse de destination vous appartient : c'est précisément ce que l'administration ne peut pas déduire du relevé."
        : "L'application compte des opérations que le relevé ne mentionne pas : elles proviennent probablement d'un autre compte, d'un wallet importé séparément, ou d'une catégorie que ce prestataire ne déclare pas.";
    } else if (s && computedSide.count === 0) {
      status = "MISSING_IN_APP";
      explanation = "Le relevé mentionne des opérations absentes de l'application : l'historique du compte est probablement incomplet (export limité à douze mois, opérations postérieures à la dernière synchronisation, sous-compte non connecté).";
    } else if (s) {
      const unitsOff = deltaUnits !== null && computedSide.units.gt(0) ? deltaUnits.abs().div(computedSide.units).toNumber() > unitTol : false;
      const amountOff = deltaAmount !== null && deltaAmount.abs().gt(floor) && computedSide.amount.gt(0) ? deltaAmount.abs().div(computedSide.amount).toNumber() > amountTol : false;
      if (!unitsOff && !amountOff && (deltaCount === null || deltaCount === 0)) {
        status = "MATCH";
      } else if (!unitsOff && amountOff && matchesOtherTreatment(s.amount, c)) {
        // The other fee treatment explains the gap exactly: the directive asks
        // for a gross amount, the XML schema for a net one, and providers
        // follow the schema.
        status = "MINOR";
        const other = computed.feeTreatment === "NET" ? "brut" : "net de frais";
        explanation = `Le montant du relevé correspond exactement au traitement ${other} des frais, alors que l'application retient le traitement ${computed.feeTreatment === "NET" ? "net de frais" : "brut"}. L'écart vaut les frais de la période, soit ${cents(c?.fees ?? ZERO).toFixed(2)} ${cur}. La directive DAC8 (annexe VI, section II, B.3, b et c) parle de montant brut, le schéma XML CARF v1.5 de montant net de frais : les deux lectures coexistent. Aucune correction n'est nécessaire, mentionnez le retraitement dans le dossier.`;
      } else if (!unitsOff && amountOff) {
        status = "DIFFERENCE";
        explanation = `Les quantités concordent mais les montants diffèrent de ${pct(deltaAmount, computedSide.amount)} : le prestataire valorise au cours de son propre carnet d'ordres et à l'instant de l'exécution, l'application au cours de référence retenu pour la comptabilité. Documentez la méthode retenue.`;
      } else if (unitsOff) {
        status = "DIFFERENCE";
        explanation = `Les quantités diffèrent de ${pct(deltaUnits, computedSide.units)} : vérifiez les frais (certains prestataires déclarent le brut, d'autres le net) et les opérations partiellement exécutées.`;
      } else {
        status = "MINOR";
        explanation = `Nombre d'opérations différent (${(deltaCount ?? 0) > 0 ? "+" : ""}${deltaCount ?? 0}) pour des totaux identiques : le prestataire regroupe les exécutions partielles d'un même ordre. Sans incidence sur le résultat imposable.`;
      }
    } else {
      continue;
    }

    lines.push({
      asset, bucket,
      statement: s ? { count: s.count, units: s.units, amount: s.amount } : null,
      computed: computedSide,
      deltaCount, deltaUnits, deltaAmount, status,
      txIds: c?.txIds ?? [],
      explanation,
      trace: step(`recon-${asset}-${bucket}`, `${asset} — ${BUCKET_LABELS[bucket].fr}`, {
        formula: "écart = relevé du prestataire − calcul de l'application",
        inputs: [
          ...(bucket === "TransferWallet" ? [] : [countVal("Opérations (relevé)", s?.count ?? 0), countVal("Opérations (application)", computedSide.count)]),
          qtyVal("Quantité (relevé)", s?.units?.toString() ?? "—", asset),
          qtyVal("Quantité (application)", computedSide.units.toString(), asset),
          money("Montant (relevé)", s?.amount?.toString() ?? "0", cur),
          money("Montant (application)", computedSide.amount.toString(), cur),
        ],
        output: text("Écart", deltaAmount ? `${cents(deltaAmount).toFixed(2)} ${cur}` : "non comparable"),
        note: explanation,
        refs: DAC8_REFS,
      }),
    });
  }

  // --- holdings ---------------------------------------------------------
  const holdingKeys = new Set([...statement.holdings.map((h) => h.asset), ...computed.holdings.map((h) => h.asset)]);
  const holdings: ReconciliationResult["holdings"] = [];
  for (const asset of [...holdingKeys].sort()) {
    const s = statement.holdings.find((h) => h.asset === asset) ?? null;
    const c = computed.holdings.find((h) => h.asset === asset) ?? null;
    const computedUnits = c?.units ?? ZERO;
    const deltaUnits = s ? s.units.minus(computedUnits) : null;
    let status: ReconciliationLine["status"] = "MATCH";
    let explanation = "Position identique à la clôture.";
    if (!s) { status = "MISSING_IN_STATEMENT"; explanation = "Position connue de l'application seulement : actif détenu hors de ce prestataire."; }
    else if (!c) { status = "MISSING_IN_APP"; explanation = "Position déclarée par le prestataire mais inconnue de l'application : historique incomplet."; }
    else if (deltaUnits && computedUnits.gt(0) && deltaUnits.abs().div(computedUnits).toNumber() > unitTol) {
      status = "DIFFERENCE";
      explanation = `Écart de ${pct(deltaUnits, computedUnits)} sur la quantité détenue : des opérations manquent d'un côté ou de l'autre. Corrigez avant de déclarer, la position de clôture est la donnée la plus facilement recoupée par l'administration.`;
    }
    holdings.push({ asset, statementUnits: s?.units ?? null, computedUnits, deltaUnits, statementValue: s?.fairMarketValue ?? null, computedValue: null, status, explanation });
  }

  // TransferWallet repeats part of CryptoTransferOut and is deliberately left
  // out of every total, on both sides.
  const statementDisposals = statement.lines.filter((l) => DISPOSAL_BUCKETS.includes(l.bucket)).reduce((a, l) => a.plus(l.amount ?? ZERO), ZERO);
  const computedDisposals = computed.buckets.filter((b) => DISPOSAL_BUCKETS.includes(b.bucket)).reduce((a, b) => a.plus(b.amount), ZERO);
  const delta = statementDisposals.minus(computedDisposals);

  const advice: string[] = [];
  if (lines.some((l) => l.status === "MISSING_IN_APP")) advice.push("Complétez l'historique du compte concerné : importez les exports CSV de chaque année ou relancez une synchronisation complète, puis recalculez.");
  if (lines.some((l) => l.status === "MISSING_IN_STATEMENT" && l.bucket.startsWith("CryptoTransfer"))) advice.push("Les transferts entrants et sortants ne sont pas des cessions : conservez les preuves que les adresses de destination vous appartiennent, le prestataire les déclare sans savoir qui les détient.");
  if (lines.some((l) => l.status === "DIFFERENCE" && l.deltaAmount && l.deltaAmount.abs().gt(floor))) advice.push("Documentez dans le dossier la source de cours retenue : l'écart de valorisation avec le prestataire est normal, son absence de justification ne l'est pas.");
  if (lines.some((l) => l.status === "MINOR" && l.explanation.includes("traitement"))) advice.push(`Le relevé applique l'autre lecture des frais. Basculez l'application sur le traitement ${computed.feeTreatment === "NET" ? "brut" : "net de frais"} pour un rapprochement ligne à ligne, ou conservez ce rapport qui chiffre l'écart.`);
  if (statement.holdingsOutsideCarf) advice.push("Ce relevé comporte des positions de fin d'année. Le CARF n'en prévoit aucune : cette partie ne sera pas transmise au titre de DAC8 et répond à une obligation nationale distincte. Elle reste rapprochée ici parce qu'elle constitue le contrôle le plus simple de l'exhaustivité de l'historique.");
  for (const n of computed.notes) advice.push(n);
  if (holdings.some((h) => h.status === "DIFFERENCE")) advice.push("Rapprochez d'abord les positions de clôture : c'est le point de contrôle le plus simple pour l'administration et une position fausse fausse tout le calcul des plus-values.");
  if (!advice.length) advice.push("Aucune action requise : conservez ce rapprochement dans le dossier, il documente la cohérence entre votre déclaration et ce que le prestataire a transmis.");

  const status: ReconciliationResult["status"] = lines.some((l) => l.status === "DIFFERENCE" || l.status === "MISSING_IN_APP") || holdings.some((h) => h.status === "DIFFERENCE" || h.status === "MISSING_IN_APP") ? "DIFFERENCES" : "MATCH";

  return {
    year: statement.year,
    currency: cur,
    caspName: statement.caspName,
    status,
    lines,
    holdings,
    totals: { statementDisposals: cents(statementDisposals), computedDisposals: cents(computedDisposals), delta: cents(delta) },
    advice,
    refs: DAC8_REFS,
    trace: step("recon", `Rapprochement DAC8 ${statement.year} — ${statement.caspName}`, {
      formula: "pour chaque actif et chaque catégorie : écart = relevé − calcul",
      inputs: [
        money("Total des cessions déclarées par le prestataire", statementDisposals.toString(), cur),
        money("Total des cessions calculées par l'application", computedDisposals.toString(), cur),
      ],
      output: money("Écart global sur les cessions", delta.toString(), cur),
      refs: DAC8_REFS,
      steps: lines.map((l) => l.trace),
      note: "Le prestataire transmet ces mêmes agrégats à son administration fiscale, qui les échange avec celle de votre pays de résidence.",
    }),
  };
}

function pct(delta: Decimal | null, base: Decimal): string {
  if (!delta || base.isZero()) return "—";
  return `${delta.div(base).mul(100).toFixed(1).replace(".", ",")} %`;
}
