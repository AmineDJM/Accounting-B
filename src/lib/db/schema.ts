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
  siren: varchar("siren", { length: 9 }),
  legalForm: varchar("legal_form", { length: 32 }),
  fiscalYearEndMonth: integer("fy_end_month").notNull().default(12),
  fiscalYearEndDay: integer("fy_end_day").notNull().default(31),
  costMethod: varchar("cost_method", { length: 8 }).$type<"CUMP" | "FIFO">().notNull().default("CUMP"),
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
