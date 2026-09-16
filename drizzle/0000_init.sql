CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"user_id" text,
	"action" varchar(48) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dac8_reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"year" integer NOT NULL,
	"status" varchar(12) DEFAULT 'DIFFERENCES' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dac8_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" text,
	"year" integer NOT NULL,
	"casp_name" text NOT NULL,
	"casp_country" varchar(2),
	"casp_identifier" varchar(64),
	"source" varchar(8) DEFAULT 'CSV' NOT NULL,
	"file_name" text,
	"sha256" varchar(64),
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"aggregates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"holdings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" varchar(16) DEFAULT 'COMPANY' NOT NULL,
	"country" varchar(2) DEFAULT 'FR' NOT NULL,
	"timezone" varchar(48) DEFAULT 'Europe/Paris' NOT NULL,
	"locale" varchar(8) DEFAULT 'fr-FR' NOT NULL,
	"tax_regime" varchar(32),
	"firm_id" text,
	"client_ref" varchar(40),
	"tax_id" varchar(32),
	"siren" varchar(9),
	"legal_form" varchar(32),
	"fy_end_month" integer DEFAULT 12 NOT NULL,
	"fy_end_day" integer DEFAULT 31 NOT NULL,
	"cost_method" varchar(8) DEFAULT 'CUMP' NOT NULL,
	"base_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"chart_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"asset_account_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_members" (
	"entity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(16) DEFAULT 'VIEWER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entity_members_entity_id_user_id_pk" PRIMARY KEY("entity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "exchange_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"exchange" varchar(16) DEFAULT 'BINANCE' NOT NULL,
	"label" text NOT NULL,
	"index" integer DEFAULT 1 NOT NULL,
	"journal_code" varchar(10),
	"api_key_enc" text,
	"api_secret_enc" text,
	"api_key_hint" varchar(12),
	"external_user_id" text,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"status_message" text,
	"last_sync_at" timestamp,
	"sync_cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_members" (
	"firm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(16) DEFAULT 'STAFF' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "firm_members_firm_id_user_id_pk" PRIMARY KEY("firm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "firms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" varchar(2) DEFAULT 'FR' NOT NULL,
	"registration" varchar(64),
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"label" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" varchar(8) DEFAULT 'OPEN' NOT NULL,
	"workflow" varchar(16) DEFAULT 'TODO' NOT NULL,
	"assignee_id" text,
	"due_date" timestamp with time zone,
	"opening_lots" jsonb,
	"opening_positions" jsonb,
	"previous_provisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closing_provisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_files" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" text,
	"file_name" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"email" text NOT NULL,
	"role" varchar(16) DEFAULT 'VIEWER' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" text,
	"kind" varchar(12) NOT NULL,
	"status" varchar(8) DEFAULT 'QUEUED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"journal_code" varchar(10) NOT NULL,
	"journal_lib" text NOT NULL,
	"seq" integer NOT NULL,
	"num" varchar(12) NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"piece_ref" text NOT NULL,
	"piece_date" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"kind" varchar(12) NOT NULL,
	"tx_id" text,
	"lines" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"fiscal_year_id" text NOT NULL,
	"method" varchar(8) NOT NULL,
	"with_inventory" boolean DEFAULT false NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"realized" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_coverage" (
	"asset" varchar(16) NOT NULL,
	"day" varchar(10) NOT NULL,
	"status" varchar(12) NOT NULL,
	"source" varchar(64) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_coverage_asset_day_pk" PRIMARY KEY("asset","day")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"asset" varchar(16) NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"price_eur" numeric(30, 12) NOT NULL,
	"source" varchar(64) NOT NULL,
	"granularity" varchar(8) DEFAULT '15m' NOT NULL,
	CONSTRAINT "prices_asset_ts_source_pk" PRIMARY KEY("asset","ts","source")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"country" varchar(2) NOT NULL,
	"regime" varchar(32) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"result" jsonb NOT NULL,
	"pack_version" varchar(32),
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" text NOT NULL,
	"source" varchar(16) NOT NULL,
	"external_id" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"type" varchar(20) NOT NULL,
	"category" varchar(24) DEFAULT 'UNKNOWN' NOT NULL,
	"legs" jsonb NOT NULL,
	"counterparty" jsonb,
	"ref" text,
	"note" text,
	"known_prices" jsonb,
	"review_status" varchar(12) DEFAULT 'AUTO' NOT NULL,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"locale" varchar(8) DEFAULT 'fr',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_entity_id" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "wallet_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"address" text NOT NULL,
	"network" varchar(32),
	"label" text,
	"kind" varchar(16) DEFAULT 'SELF' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dac8_reconciliations" ADD CONSTRAINT "dac8_reconciliations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dac8_reconciliations" ADD CONSTRAINT "dac8_reconciliations_statement_id_dac8_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."dac8_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dac8_reconciliations" ADD CONSTRAINT "dac8_reconciliations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dac8_statements" ADD CONSTRAINT "dac8_statements_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dac8_statements" ADD CONSTRAINT "dac8_statements_account_id_exchange_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."exchange_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dac8_statements" ADD CONSTRAINT "dac8_statements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_accounts" ADD CONSTRAINT "exchange_accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_members" ADD CONSTRAINT "firm_members_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_members" ADD CONSTRAINT "firm_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_account_id_exchange_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."exchange_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_account_id_exchange_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."exchange_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_run_id_journal_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."journal_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_runs" ADD CONSTRAINT "journal_runs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_runs" ADD CONSTRAINT "journal_runs_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_runs" ADD CONSTRAINT "journal_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_runs" ADD CONSTRAINT "tax_runs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_runs" ADD CONSTRAINT "tax_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_exchange_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."exchange_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dac8_recon_entity_idx" ON "dac8_reconciliations" USING btree ("entity_id","year");--> statement-breakpoint
CREATE INDEX "dac8_statements_entity_idx" ON "dac8_statements" USING btree ("entity_id","year");--> statement-breakpoint
CREATE INDEX "exchange_accounts_entity_idx" ON "exchange_accounts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "fiscal_years_entity_idx" ON "fiscal_years" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "jobs_entity_idx" ON "jobs" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "journal_entries_run_idx" ON "journal_entries" USING btree ("run_id","journal_code","seq");--> statement-breakpoint
CREATE INDEX "prices_asset_ts_idx" ON "prices" USING btree ("asset","ts");--> statement-breakpoint
CREATE INDEX "tax_runs_entity_idx" ON "tax_runs" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_external_idx" ON "transactions" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "transactions_entity_ts_idx" ON "transactions" USING btree ("entity_id","timestamp");--> statement-breakpoint
CREATE INDEX "wallet_addresses_entity_idx" ON "wallet_addresses" USING btree ("entity_id");