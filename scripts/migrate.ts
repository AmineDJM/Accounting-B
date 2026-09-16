/* Applies pending migrations (drizzle/) to DATABASE_URL, or to the local PGlite database. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const ssl = /localhost|127\.0\.0\.1/.test(url) || process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false };
    const pool = new Pool({ connectionString: url, ssl });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await pool.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.close();
  }
  console.log("Migrations applied");
}
main().catch((e) => { console.error(e); process.exit(1); });
