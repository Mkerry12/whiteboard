import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildApp, type BuiltApp } from "../../src/app.js";
import {
  documentNameForBoard,
  formatJwtCollabToken,
} from "../../src/collaboration/contract.js";
import type { AppConfig } from "../../src/config.js";
import { createDatabase } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { whiteboards } from "../../src/db/schema.js";
import {
  createBoard,
  listen,
  openCollabProvider,
  registerUser,
  resetDatabase,
  waitFor,
} from "../helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const servicesConfigured = Boolean(databaseUrl && redisUrl);

function integrationConfig(instanceId: string, redisPrefix: string): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    databaseUrl: databaseUrl ?? "",
    redisUrl: redisUrl ?? "",
    jwtSecret: "integration-test-secret",
    jwtExpiresIn: "1h",
    corsOrigins: ["http://localhost:5173"],
    instanceId,
    redisPrefix,
    log: false,
  };
}

function connect(url: string, documentName: string, token: string) {
  const document = new Y.Doc();
  const provider = openCollabProvider({
    url,
    name: documentName,
    document,
    token,
  });
  return { document, provider };
}

describe.skipIf(!servicesConfigured)("postgres and redis", () => {
  const servers: BuiltApp[] = [];
  const redisClients: Redis[] = [];
  let pool: { end(): Promise<void> } | undefined;
  let db: Awaited<ReturnType<typeof createDatabase>>["db"] | undefined;

  function trackRedis(url: string): Redis {
    const client = new Redis(url, { maxRetriesPerRequest: 2 });
    client.on("error", () => undefined);
    redisClients.push(client);
    return client;
  }

  async function database() {
    if (!databaseUrl || !redisUrl) {
      throw new Error("DATABASE_URL and REDIS_URL are required");
    }
    if (!db || !pool) {
      const created = createDatabase(databaseUrl);
      db = created.db;
      pool = created.pool;
      await migrateDatabase(db);
    }
    await resetDatabase(db);
    return db;
  }

  afterAll(async () => {
    for (const server of servers) {
      try {
        server.hocuspocus.closeConnections();
        await server.app.close();
      } catch {
        // A test may already have closed its HTTP server.
      }
      server.redisExtension?.pub.disconnect();
      server.redisExtension?.sub.disconnect();
    }
    await Promise.all(
      redisClients.map((client) =>
        client.quit().catch(() => {
          client.disconnect();
        }),
      ),
    );
    await pool?.end();
  });

  it("replicates a write across instances before Postgres stores it", async () => {
    if (!redisUrl) {
      return;
    }
    const prefix = `it-redis-${process.pid}-${Date.now().toString(36)}`;
    const appDb = await database();
    const primary = await buildApp({
      config: integrationConfig("integration-a", prefix),
      db: appDb,
      redis: trackRedis(redisUrl),
      collaboration: { debounce: 60_000, maxDebounce: 60_000 },
    });
    servers.push(primary);

    const ada = await registerUser(primary.app, { email: "ada@example.com" });
    const board = await createBoard(primary.app, ada.accessToken, "Shared");
    const documentName = documentNameForBoard(board.id);
    const token = formatJwtCollabToken(ada.accessToken);
    const primaryUrl = await listen(primary.app);
    const writer = connect(primaryUrl, documentName, token);

    const peer = await buildApp({
      config: integrationConfig("integration-b", prefix),
      db: appDb,
      redis: trackRedis(redisUrl),
      collaboration: { debounce: 60_000, maxDebounce: 60_000 },
    });
    servers.push(peer);
    const peerUrl = await listen(peer.app);
    const reader = connect(peerUrl, documentName, token);

    try {
      await waitFor(
        () => writer.provider.synced && writer.provider.isAuthenticated,
      );
      await waitFor(
        () => reader.provider.synced && reader.provider.isAuthenticated,
      );
      writer.document.getMap("shapes").set("shape-1", "from-a");
      await waitFor(
        () => reader.document.getMap("shapes").get("shape-1") === "from-a",
      );

      const rows = await appDb
        .select({ yjsState: whiteboards.yjsState })
        .from(whiteboards)
        .where(eq(whiteboards.id, board.id))
        .limit(1);
      expect(rows[0]?.yjsState ?? null).toBeNull();
    } finally {
      writer.provider.destroy();
      writer.document.destroy();
      reader.provider.destroy();
      reader.document.destroy();
    }
  });

  it("loads the Yjs snapshot from Postgres after the server restarts", async () => {
    if (!redisUrl) {
      return;
    }
    const prefix = `it-pg-${process.pid}-${Date.now().toString(36)}`;
    const appDb = await database();
    const started = await buildApp({
      config: integrationConfig("integration-store", prefix),
      db: appDb,
      redis: trackRedis(redisUrl),
      collaboration: { debounce: 30, maxDebounce: 60 },
    });
    servers.push(started);

    const ada = await registerUser(started.app, { email: "ada@example.com" });
    const board = await createBoard(started.app, ada.accessToken, "Durable");
    const documentName = documentNameForBoard(board.id);
    const token = formatJwtCollabToken(ada.accessToken);
    const firstUrl = await listen(started.app);
    const writer = connect(firstUrl, documentName, token);

    try {
      await waitFor(
        () => writer.provider.synced && writer.provider.isAuthenticated,
      );
      writer.document.getMap("shapes").set("shape-1", "sticky");
      await waitFor(async () => {
        const rows = await appDb
          .select({ yjsState: whiteboards.yjsState })
          .from(whiteboards)
          .where(eq(whiteboards.id, board.id))
          .limit(1);
        return (rows[0]?.yjsState?.byteLength ?? 0) > 0;
      });
    } finally {
      writer.provider.destroy();
      writer.document.destroy();
    }

    started.hocuspocus.closeConnections();
    await started.app.close();

    const restarted = await buildApp({
      config: integrationConfig("integration-restart", prefix),
      db: appDb,
      redis: trackRedis(redisUrl),
      collaboration: { debounce: 30, maxDebounce: 60 },
    });
    servers.push(restarted);
    const restartedUrl = await listen(restarted.app);
    const reader = connect(restartedUrl, documentName, token);
    try {
      await waitFor(
        () => reader.provider.synced && reader.provider.isAuthenticated,
      );
      await waitFor(
        () => reader.document.getMap("shapes").get("shape-1") === "sticky",
      );
    } finally {
      reader.provider.destroy();
      reader.document.destroy();
    }
  });
});
