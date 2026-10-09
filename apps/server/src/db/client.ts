import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export type AppDb = NodePgDatabase<typeof schema>;

export function createDatabase(databaseUrl: string): {
  db: AppDb;
  pool: pg.Pool;
} {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
