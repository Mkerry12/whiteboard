import { PGlite } from "@electric-sql/pglite";
import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
} from "@hocuspocus/provider";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import type * as Y from "yjs";
import type { AppConfig } from "../src/config.js";
import type { BuiltApp } from "../src/app.js";
import { buildApp } from "../src/app.js";
import type { AppDb } from "../src/db/client.js";
import { migrationsFolder } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import type { RedisPing } from "../src/routes/health.js";

export function openCollabProvider(options: {
  url: string;
  name: string;
  document: Y.Doc;
  token: string;
  onAuthenticationFailed?: (data: { reason: string }) => void;
}): HocuspocusProvider {
  // Passing the socket options on the provider makes it own the connection
  // and close it in destroy(). The published configuration type only lists
  // `url` from the websocket options, even though the constructor forwards
  // the rest.
  return new HocuspocusProvider({
    url: options.url,
    name: options.name,
    document: options.document,
    token: options.token,
    onAuthenticationFailed: options.onAuthenticationFailed,
    maxAttempts: 1,
    WebSocketPolyfill: WebSocket,
  } as HocuspocusProviderConfiguration);
}

export function testConfig(): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    databaseUrl: "postgresql://postgres:postgres@localhost:5432/whiteboard",
    redisUrl: "redis://127.0.0.1:6379",
    jwtSecret: "test-jwt-secret-should-be-long",
    jwtExpiresIn: "1h",
    corsOrigins: ["http://localhost:5173"],
    instanceId: `test-${process.pid}`,
    redisPrefix: "whiteboard-test",
    log: false,
  };
}

export interface TestContext extends BuiltApp {
  db: AppDb;
  restart(): Promise<string>;
  close(): Promise<void>;
}

export async function createTestApp(
  redis: RedisPing | null = null,
): Promise<TestContext> {
  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: migrationsFolder() });
  const db = pglite as unknown as AppDb;
  const options = {
    config: testConfig(),
    db,
    redis,
    collaboration: { debounce: 30, maxDebounce: 60 },
  };
  let built = await buildApp(options);
  let closed = false;

  return {
    get app() {
      return built.app;
    },
    get hocuspocus() {
      return built.hocuspocus;
    },
    get redisExtension() {
      return built.redisExtension;
    },
    db,
    async restart() {
      built.hocuspocus.closeConnections();
      await built.app.close();
      built = await buildApp(options);
      return listen(built.app);
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        built.hocuspocus.closeConnections();
        await built.app.close();
      } catch {
        // The restart test may already have replaced or closed the server.
      }
      await client.close();
    },
  };
}

export async function resetDatabase(db: AppDb): Promise<void> {
  await db.execute(
    sql`truncate table board_members, share_links, whiteboards, users cascade`,
  );
}

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export function shareHeader(token: string): { authorization: string } {
  return { authorization: `Share ${token}` };
}

export interface AuthResponse {
  user: { id: string; email: string; name: string; createdAt: string };
  accessToken: string;
}

export async function registerUser(
  app: FastifyInstance,
  input: { email: string; password?: string; name?: string } = {
    email: "ada@example.com",
  },
): Promise<AuthResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: input.email,
      password: input.password ?? "password123",
      name: input.name ?? "Ada Lovelace",
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

export interface WhiteboardResponse {
  id: string;
  title: string;
  role: "owner" | "editor" | "viewer";
  owner: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export async function createBoard(
  app: FastifyInstance,
  token: string,
  title = "Sprint board",
): Promise<WhiteboardResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/whiteboards",
    headers: bearer(token),
    payload: { title },
  });
  if (response.statusCode !== 201) {
    throw new Error(
      `create board failed: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json().whiteboard;
}

export async function createShareLink(
  app: FastifyInstance,
  token: string,
  boardId: string,
  role: "editor" | "viewer",
): Promise<{
  id: string;
  token: string;
  role: "editor" | "viewer";
  revokedAt: string | null;
}> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/whiteboards/${boardId}/share-links`,
    headers: bearer(token),
    payload: { role },
  });
  if (response.statusCode !== 201) {
    throw new Error(
      `create share link failed: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json().shareLink;
}

export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not bind to a TCP port");
  }
  return `ws://127.0.0.1:${address.port}/collaboration`;
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}
