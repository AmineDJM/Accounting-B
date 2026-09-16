import type { ExchangeKind } from "@/lib/db/schema";

/**
 * The platforms a file can be connected to, and what each one needs.
 *
 * Kept free of any server dependency so the same description drives the
 * connection wizard in the browser and the checks on the server. Every entry
 * says, in the platform's own words, how to create a key that can only read —
 * a wrong permission here is the difference between an accounting tool and a
 * key that can move money.
 */
export interface PlatformSpec {
  code: ExchangeKind;
  name: string;
  /** Whether a key can be connected, or only files imported. */
  api: boolean;
  /** Field labels, because the two secrets are not called the same thing anywhere. */
  keyLabel: string;
  secretLabel: string;
  /** Coinbase's private key is a PEM block: it needs a text area, not a line. */
  secretMultiline?: boolean;
  keyPlaceholder?: string;
  secretPlaceholder?: string;
  /** How to create a read-only key, step by step. */
  steps: string[];
  permissions: string;
  docsUrl: string;
  /** What a file export brings when there is no key. */
  csv: string;
}

export const PLATFORMS: PlatformSpec[] = [
  {
    code: "BINANCE",
    name: "Binance",
    api: true,
    keyLabel: "Clé API",
    secretLabel: "Clé secrète",
    keyPlaceholder: "64 caractères",
    secretPlaceholder: "affichée une seule fois à la création",
    steps: [
      "Binance → Profil → Gestion des API → Créer une API.",
      "Cochez uniquement « Activer la lecture ». Décochez le trading, les retraits et le futures.",
      "Restreignez l'accès à l'adresse IP du serveur si vous la connaissez.",
      "Copiez la clé et le secret : le secret n'est affiché qu'une fois.",
    ],
    permissions: "Lecture seule (Enable Reading)",
    docsUrl: "https://www.binance.com/fr/my/settings/api-management",
    csv: "Export « Historique des transactions » (Wallet → Historique → Exporter), tous types, par tranches d'un an.",
  },
  {
    code: "KRAKEN",
    name: "Kraken",
    api: true,
    keyLabel: "Clé API",
    secretLabel: "Clé privée",
    keyPlaceholder: "56 caractères",
    secretPlaceholder: "base64, affichée une seule fois",
    steps: [
      "Kraken → Paramètres → API → Créer une clé.",
      "Cochez « Query Funds », « Query Open Orders & Trades », « Query Closed Orders & Trades » et « Query Ledger Entries ».",
      "Ne cochez ni les ordres, ni les retraits, ni le staking.",
      "Copiez la clé et la clé privée telles quelles.",
    ],
    permissions: "Query funds, orders, trades et ledger — rien d'autre",
    docsUrl: "https://www.kraken.com/u/security/api",
    csv: "Export « Ledgers » et « Trades » (History → Export), format CSV.",
  },
  {
    code: "COINBASE",
    name: "Coinbase",
    api: true,
    keyLabel: "Nom de la clé",
    secretLabel: "Clé privée",
    secretMultiline: true,
    keyPlaceholder: "organizations/…/apiKeys/…",
    secretPlaceholder: "-----BEGIN EC PRIVATE KEY-----\n…\n-----END EC PRIVATE KEY-----",
    steps: [
      "Coinbase Developer Platform (portal.cdp.coinbase.com) → API keys → Create key.",
      "Permission « View » uniquement : ni Trade, ni Transfer.",
      "Téléchargez le fichier JSON : il contient le nom de la clé et la clé privée.",
      "Collez le nom (organizations/…/apiKeys/…) et le bloc de clé privée entier.",
    ],
    permissions: "View",
    docsUrl: "https://portal.cdp.coinbase.com/access/api",
    csv: "Rapport « Transaction history » (Coinbase → Reports), format CSV.",
  },
  {
    code: "GENERIC",
    name: "Autre plateforme (fichier)",
    api: false,
    keyLabel: "",
    secretLabel: "",
    steps: [],
    permissions: "",
    docsUrl: "",
    csv: "Bitvavo, Bitpanda, Crypto.com, Bitstamp, Ledger Live, ou n'importe quel CSV : le format est reconnu automatiquement.",
  },
];

export function platformSpec(code: string | null | undefined): PlatformSpec {
  return PLATFORMS.find((p) => p.code === code) ?? PLATFORMS[PLATFORMS.length - 1];
}

/** The platforms that can be connected with a key. */
export const API_PLATFORMS = PLATFORMS.filter((p) => p.api);
