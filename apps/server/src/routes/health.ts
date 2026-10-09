import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDb } from "../db/client.js";

export interface RedisPing {
  ping(): Promise<string>;
}

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: { db: AppDb; redis: RedisPing | null },
): void {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    const checks = {
      database: "ok" as "ok" | "unavailable",
      redis: "ok" as "ok" | "unavailable",
    };

    try {
      await deps.db.execute(sql`select 1`);
    } catch {
      checks.database = "unavailable";
    }

    if (!deps.redis) {
      checks.redis = "unavailable";
    } else {
      try {
        const pong = await deps.redis.ping();
        if (pong !== "PONG") {
          checks.redis = "unavailable";
        }
      } catch {
        checks.redis = "unavailable";
      }
    }

    const ready = checks.database === "ok" && checks.redis === "ok";
    return reply.status(ready ? 200 : 503).send({
      status: ready ? "ok" : "unavailable",
      checks,
    });
  });
}
