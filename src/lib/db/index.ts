import "server-only";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Database access.
 *  - DATABASE_URL set  -> PostgreSQL via node-postgres (production, e.g. Render managed Postgres)
 *  - otherwise         -> embedded PGlite in ./.data/pglite (local development, zero setup)
 * Migrations in ./drizzle are applied automatically on first use.
 */
const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (process.env.NEXT_PHASE === "phase-production-build") {
    // `next build` imports route modules to collect metadata: never touch a real database then.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    return drizzle(new PGlite(), { schema }) as unknown as Db;
  }
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const ssl = process.env.DATABASE_SSL === "false" ? undefined : /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
    const pool = new Pool({ connectionString: url, ssl, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    const db = drizzle(pool, { schema });
    if (process.env.DB_AUTO_MIGRATE !== "false") await migrate(db, { migrationsFolder: "drizzle" });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  if (dir !== ":memory:") (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir === ":memory:" ? undefined : dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__db) globalForDb.__db = create();
  return globalForDb.__db;
}

export { schema };
