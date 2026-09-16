import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ---------------------------------------------------------------- Auth.js */
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  locale: varchar("locale", { length: 8 }).default("fr"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastEntityId: text("last_entity_id"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* --------------------------------------------------------- Multi-tenancy */
export type EntityKind = "COMPANY" | "INDIVIDUAL";
export type MemberRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER";

export const entities = pgTable("entities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  kind: varchar("kind", { length: 16 }).$type<EntityKind>().notNull().default("COMPANY"),
  /** ISO 3166-1 alpha-2 code of the country whose rules apply to this file. */
  country: varchar("country", { length: 2 }).notNull().default("FR"),
  timezone: varchar("timezone", { length: 48 }).notNull().default("Europe/Paris"),
  locale: varchar("locale", { length: 8 }).notNull().default("fr-FR"),
  /** Regime chosen among those the country offers (e.g. BE: private / speculative / professional). */
  taxRegime: varchar("tax_regime", { length: 32 }),
  /** Accounting firm this file belongs to, when managed by a practice. */
  firmId: text("firm_id"),
  /** The firm's own client reference. */
  clientRef: varchar("client_ref", { length: 40 }),
  taxId: varchar("tax_id", { length: 32 }),
  siren: varchar("siren", { length: 9 }),
  legalForm: varchar("legal_form", { length: 32 }),
  fiscalYearEndMonth: integer("fy_end_month").notNull().default(12),
  fiscalYearEndDay: integer("fy_end_day").notNull().default(31),
  costMethod: varchar("cost_method", { length: 8 }).$type<"CUMP" | "FIFO" | "LIFO" | "HIFO">().notNull().default("CUMP"),
  /** Currency the books are kept in (EUR, CHF, AED…). */
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("EUR"),
  chartOverrides: jsonb("chart_overrides").$type<Record<string, unknown>>().notNull().default({}),
  assetAccountMap: jsonb("asset_account_map").$type<Record<string, string>>().notNull().default({}),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const entityMembers = pgTable(
  "entity_members",
  {
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).$type<MemberRole>().notNull().default("VIEWER"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.userId] })],
);

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: varchar("role", { length: 16 }).$type<MemberRole>().notNull().default("VIEWER"),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* -------------------------------------------------------- Data sources */
export type ExchangeKind = "BINANCE" | "GENERIC";
export type AccountStatus = "ACTIVE" | "ERROR" | "DISABLED";

export const exchangeAccounts = pgTable(
  "exchange_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    exchange: varchar("exchange", { length: 16 }).$type<ExchangeKind>().notNull().default("BINANCE"),
    label: text("label").notNull(),
    index: integer("index").notNull().default(1),
    journalCode: varchar("journal_code", { length: 10 }),
    apiKeyEnc: text("api_key_enc"),
    apiSecretEnc: text("api_secret_enc"),
    apiKeyHint: varchar("api_key_hint", { length: 12 }),
    externalUserId: text("external_user_id"),
    status: varchar("status", { length: 16 }).$type<AccountStatus>().notNull().default("ACTIVE"),
    statusMessage: text("status_message"),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    syncCursor: jsonb("sync_cursor").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("exchange_accounts_entity_idx").on(t.entityId)],
);

export const walletAddresses = pgTable(
  "wallet_addresses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    network: varchar("network", { length: 32 }),
    label: text("label"),
    kind: varchar("kind", { length: 16 }).$type<"SELF" | "CUSTOMER" | "SUPPLIER" | "OTHER">().notNull().default("SELF"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("wallet_addresses_entity_idx").on(t.entityId)],
);

export const importFiles = pgTable("import_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => exchangeAccounts.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  rowCount: integer("row_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------- Transactions */
export interface StoredLeg { asset: string; amount: string; role: "IN" | "OUT" | "FEE" }
export interface StoredCounterparty { kind: string; address?: string; network?: string; txHash?: string; label?: string }

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => exchangeAccounts.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 16 }).notNull(),
    externalId: text("external_id").notNull(),
    timestamp: timestamp("timestamp", { mode: "date", withTimezone: true }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    category: varchar("category", { length: 24 }).notNull().default("UNKNOWN"),
    legs: jsonb("legs").$type<StoredLeg[]>().notNull(),
    counterparty: jsonb("counterparty").$type<StoredCounterparty | null>(),
    ref: text("ref"),
    note: text("note"),
    knownPrices: jsonb("known_prices").$type<Record<string, string> | null>(),
    reviewStatus: varchar("review_status", { length: 12 }).$type<"AUTO" | "REVIEWED" | "FLAGGED">().notNull().default("AUTO"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("transactions_account_external_idx").on(t.accountId, t.externalId),
    index("transactions_entity_ts_idx").on(t.entityId, t.timestamp),
  ],
);

/* ------------------------------------------------------------- Prices */
export const prices = pgTable(
  "prices",
  {
    asset: varchar("asset", { length: 16 }).notNull(),
    ts: timestamp("ts", { mode: "date", withTimezone: true }).notNull(),
    priceEur: numeric("price_eur", { precision: 30, scale: 12 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    granularity: varchar("granularity", { length: 8 }).notNull().default("15m"),
  },
  (t) => [primaryKey({ columns: [t.asset, t.ts, t.source] }), index("prices_asset_ts_idx").on(t.asset, t.ts)],
);

/** Days for which prices were fetched for an asset (so we do not re-query providers). */
export const priceCoverage = pgTable(
  "price_coverage",
  {
    asset: varchar("asset", { length: 16 }).notNull(),
    day: varchar("day", { length: 10 }).notNull(), // YYYY-MM-DD
    status: varchar("status", { length: 12 }).notNull(), // OK | MISSING
    source: varchar("source", { length: 64 }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.asset, t.day] })],
);

/* ----------------------------------------------------- Fiscal years */
export const fiscalYears = pgTable(
  "fiscal_years",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    startDate: timestamp("start_date", { mode: "date", withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { mode: "date", withTimezone: true }).notNull(),
    status: varchar("status", { length: 8 }).$type<"OPEN" | "CLOSED">().notNull().default("OPEN"),
    workflow: varchar("workflow", { length: 16 }).$type<"TODO" | "IN_PROGRESS" | "REVIEW" | "DONE">().notNull().default("TODO"),
    assigneeId: text("assignee_id"),
    dueDate: timestamp("due_date", { mode: "date", withTimezone: true }),
    /** Lot ledger carried over from the previous year, for holding-period continuity. */
    openingLots: jsonb("opening_lots").$type<{ asset: string; wallet: string; qty: string; unitCost: string; acquiredAt: string; legacy: boolean }[] | null>(),
    openingPositions: jsonb("opening_positions").$type<{ asset: string; qty: string; totalCost: string }[] | null>(),
    previousProvisions: jsonb("previous_provisions").$type<Record<string, string>>().notNull().default({}),
    closingProvisions: jsonb("closing_provisions").$type<Record<string, string>>().notNull().default({}),
    closedAt: timestamp("closed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("fiscal_years_entity_idx").on(t.entityId)],
);

/* ------------------------------------------------------------ Journal */
export const journalRuns = pgTable("journal_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  fiscalYearId: text("fiscal_year_id").notNull().references(() => fiscalYears.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 8 }).notNull(),
  withInventory: boolean("with_inventory").notNull().default(false),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  warnings: jsonb("warnings").$type<{ code: string; level: string; message: string; txId?: string; date?: string }[]>().notNull().default([]),
  inventory: jsonb("inventory").$type<Record<string, unknown>[]>().notNull().default([]),
  realized: jsonb("realized").$type<Record<string, unknown>[]>().notNull().default([]),
  positions: jsonb("positions").$type<Record<string, unknown>[]>().notNull().default([]),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    runId: text("run_id").notNull().references(() => journalRuns.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    journalCode: varchar("journal_code", { length: 10 }).notNull(),
    journalLib: text("journal_lib").notNull(),
    seq: integer("seq").notNull(),
    num: varchar("num", { length: 12 }).notNull(),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    pieceRef: text("piece_ref").notNull(),
    pieceDate: timestamp("piece_date", { mode: "date", withTimezone: true }).notNull(),
    label: text("label").notNull(),
    kind: varchar("kind", { length: 12 }).notNull(),
    txId: text("tx_id"),
    lines: jsonb("lines").$type<{ account: string; accountLabel: string; label: string; debit: string; credit: string; currencyAmount?: string; currency?: string }[]>().notNull(),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  },
  (t) => [index("journal_entries_run_idx").on(t.runId, t.journalCode, t.seq)],
);

/* --------------------------------------------------------------- Jobs */
export type JobKind = "API_SYNC" | "CSV_IMPORT" | "PRICING" | "JOURNAL";
export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => exchangeAccounts.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 12 }).$type<JobKind>().notNull(),
    status: varchar("status", { length: 8 }).$type<JobStatus>().notNull().default("QUEUED"),
    progress: integer("progress").notNull().default(0),
    message: text("message"),
    log: jsonb("log").$type<{ at: string; level: string; message: string }[]>().notNull().default([]),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { mode: "date" }),
    finishedAt: timestamp("finished_at", { mode: "date" }),
  },
  (t) => [index("jobs_entity_idx").on(t.entityId, t.createdAt)],
);

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityId: text("entity_id").references(() => entities.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 48 }).notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});


/* ------------------------------------------------- Accounting practices */
export type FirmRole = "OWNER" | "MANAGER" | "STAFF";

export const firms = pgTable("firms", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  country: varchar("country", { length: 2 }).notNull().default("FR"),
  /** Professional registration (numéro d'inscription à l'Ordre, Steuerberaterkammer…). */
  registration: varchar("registration", { length: 64 }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const firmMembers = pgTable(
  "firm_members",
  {
    firmId: text("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).$type<FirmRole>().notNull().default("STAFF"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.firmId, t.userId] })],
);

/* --------------------------------------------------------- DAC8 / CARF */
export type Dac8Source = "CSV" | "XML" | "MANUAL";

export interface Dac8Aggregate {
  asset: string;
  /**
   * One of the eight CARF XML schema elements: CryptoFiatIn, CryptoFiatOut,
   * CryptotoCryptoIn, CryptotoCryptoOut, CryptoTransferIn, CryptoTransferOut,
   * TransferWallet, RRPT.
   */
  type: string;
  /** Absent for TransferWallet, the only element with no transaction count. */
  count?: number | null;
  units?: string;
  /** The amount as the provider reported it, whichever fee treatment it used. */
  amount?: string;
  /** Kept for statements imported before the schema names were adopted. */
  grossAmount?: string;
  currency?: string;
  /** ExchangeType or TransferType code (CARF401 to CARF606), when given. */
  typeCode?: string;
  /** AltValuation code (CARF1001 to CARF1004), when the provider used one. */
  altValuation?: string;
}

export interface Dac8Holding {
  asset: string;
  units: string;
  fairMarketValue?: string;
  currency?: string;
}

/** An annual statement received from a crypto-asset service provider under DAC8 / CARF. */
export const dac8Statements = pgTable(
  "dac8_statements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => exchangeAccounts.id, { onDelete: "set null" }),
    year: integer("year").notNull(),
    caspName: text("casp_name").notNull(),
    caspCountry: varchar("casp_country", { length: 2 }),
    caspIdentifier: varchar("casp_identifier", { length: 64 }),
    source: varchar("source", { length: 8 }).$type<Dac8Source>().notNull().default("CSV"),
    fileName: text("file_name"),
    sha256: varchar("sha256", { length: 64 }),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    aggregates: jsonb("aggregates").$type<Dac8Aggregate[]>().notNull().default([]),
    holdings: jsonb("holdings").$type<Dac8Holding[]>().notNull().default([]),
    raw: jsonb("raw"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("dac8_statements_entity_idx").on(t.entityId, t.year)],
);

export const dac8Reconciliations = pgTable(
  "dac8_reconciliations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    statementId: text("statement_id").notNull().references(() => dac8Statements.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    status: varchar("status", { length: 12 }).$type<"MATCH" | "DIFFERENCES" | "FAILED">().notNull().default("DIFFERENCES"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    lines: jsonb("lines").$type<Record<string, unknown>[]>().notNull().default([]),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("dac8_recon_entity_idx").on(t.entityId, t.year)],
);

/** Stored personal-tax computations, keyed by country and year, with their trace. */
export const taxRuns = pgTable(
  "tax_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    country: varchar("country", { length: 2 }).notNull(),
    regime: varchar("regime", { length: 32 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    packVersion: varchar("pack_version", { length: 32 }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("tax_runs_entity_idx").on(t.entityId, t.createdAt)],
);
