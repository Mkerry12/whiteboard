import "../load-env.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "./client.js";
import { migrateDatabase } from "./migrate.js";

const config = loadConfig();
const { db, pool } = createDatabase(config.databaseUrl);

await migrateDatabase(db);
await pool.end();
