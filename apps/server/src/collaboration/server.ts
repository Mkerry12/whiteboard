import { Database } from "@hocuspocus/extension-database";
import { Redis as RedisExtension } from "@hocuspocus/extension-redis";
import { Hocuspocus } from "@hocuspocus/server";
import { eq } from "drizzle-orm";
import { Redis as RedisClient } from "ioredis";
import type { AppDb } from "../db/client.js";
import { whiteboards } from "../db/schema.js";
import { authorizeConnection } from "./auth.js";
import { boardIdFromDocumentName } from "./contract.js";

export interface CollaborationOptions {
  db: AppDb;
  jwtSecret: string;
  instanceId: string;
  redisPrefix: string;
  redis: RedisClient | null;
  debounce?: number;
  maxDebounce?: number;
}

export interface CollaborationServer {
  hocuspocus: Hocuspocus;
  redisExtension: RedisExtension | null;
}

function ignoreRedisErrors(client: {
  on(event: "error", listener: (error: Error) => void): void;
}): void {
  client.on("error", () => {
    // ioredis emits connection errors asynchronously. A listener keeps them
    // from crashing the process while /health/ready reports Redis as down.
  });
}

export function createCollaboration(
  options: CollaborationOptions,
): CollaborationServer {
  const extensions: Array<Database | RedisExtension> = [];
  let redisExtension: RedisExtension | null = null;

  if (options.redis) {
    ignoreRedisErrors(options.redis);
    redisExtension = new RedisExtension({
      redis: options.redis,
      prefix: options.redisPrefix,
      identifier: options.instanceId,
    });
    ignoreRedisErrors(redisExtension.pub);
    ignoreRedisErrors(redisExtension.sub);
    extensions.push(redisExtension);
  }

  extensions.push(
    new Database({
      fetch: async ({ documentName }) => {
        const boardId = boardIdFromDocumentName(documentName);
        if (!boardId) {
          return null;
        }
        const rows = await options.db
          .select({ yjsState: whiteboards.yjsState })
          .from(whiteboards)
          .where(eq(whiteboards.id, boardId))
          .limit(1);
        return rows[0]?.yjsState ?? null;
      },
      store: async ({ documentName, state }) => {
        const boardId = boardIdFromDocumentName(documentName);
        if (!boardId) {
          return;
        }
        await options.db
          .update(whiteboards)
          .set({
            yjsState: new Uint8Array(state),
            updatedAt: new Date(),
          })
          .where(eq(whiteboards.id, boardId));
      },
    }),
  );

  const hocuspocus = new Hocuspocus({
    name: options.instanceId,
    quiet: true,
    debounce: options.debounce ?? 2000,
    maxDebounce: options.maxDebounce ?? 10_000,
    extensions,
    async onAuthenticate(data) {
      return authorizeConnection(options.db, options.jwtSecret, {
        token: data.token,
        documentName: data.documentName,
        connectionConfig: data.connectionConfig,
      });
    },
  });

  return { hocuspocus, redisExtension };
}

export function createRedis(redisUrl: string): RedisClient {
  const client = new RedisClient(redisUrl, {
    maxRetriesPerRequest: 2,
  });
  ignoreRedisErrors(client);
  return client;
}
