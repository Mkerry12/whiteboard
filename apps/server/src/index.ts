import "./load-env.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createRedis } from "./collaboration/server.js";
import { createDatabase } from "./db/client.js";
import { migrateDatabase } from "./db/migrate.js";

const config = loadConfig();
const { db, pool } = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);

await migrateDatabase(db);

const { app, hocuspocus, redisExtension } = await buildApp({
  config,
  db,
  redis,
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  hocuspocus.closeConnections();
  await app.close();
  if (redisExtension) {
    await redisExtension.pub.quit();
    await redisExtension.sub.quit();
  }
  await redis.quit();
  await pool.end();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ port: config.port, host: config.host });
app.log.info(
  { port: config.port, host: config.host, instanceId: config.instanceId },
  "whiteboard server listening",
);
