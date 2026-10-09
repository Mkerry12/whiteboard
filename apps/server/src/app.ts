import cors from "@fastify/cors";
import { Redis as RedisClient } from "ioredis";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { attachCollaboration } from "./collaboration/attach.js";
import {
  createCollaboration,
  type CollaborationServer,
} from "./collaboration/server.js";
import type { AppDb } from "./db/client.js";
import { ErrorCode, HttpError } from "./errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes, type RedisPing } from "./routes/health.js";
import { registerShareLinkRoutes } from "./routes/share-links.js";
import { registerWhiteboardRoutes } from "./routes/whiteboards.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: AppDb;
  redis: RedisClient | RedisPing | null;
  collaboration?: {
    debounce?: number;
    maxDebounce?: number;
  };
}

export interface BuiltApp extends CollaborationServer {
  app: FastifyInstance;
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    error:
      details === undefined ? { code, message } : { code, message, details },
  };
}

export async function buildApp(options: BuildAppOptions): Promise<BuiltApp> {
  const app = Fastify({
    logger: options.config.log,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(error.code, error.message, error.details));
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "Request failed";

    if (statusCode >= 400 && statusCode < 500) {
      const code =
        statusCode === 401
          ? ErrorCode.UNAUTHORIZED
          : ErrorCode.VALIDATION_ERROR;
      return reply.status(statusCode).send(errorBody(code, message));
    }

    request.log.error(error);
    return reply
      .status(500)
      .send(errorBody(ErrorCode.INTERNAL_ERROR, "Internal server error"));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorBody(ErrorCode.NOT_FOUND, "Not found"));
  });

  await app.register(cors, {
    origin: options.config.corsOrigins.includes("*")
      ? true
      : options.config.corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  const redisClient =
    options.redis instanceof RedisClient ? options.redis : null;
  const collaboration = createCollaboration({
    db: options.db,
    jwtSecret: options.config.jwtSecret,
    instanceId: options.config.instanceId,
    redisPrefix: options.config.redisPrefix,
    redis: redisClient,
    debounce: options.collaboration?.debounce,
    maxDebounce: options.collaboration?.maxDebounce,
  });

  registerHealthRoutes(app, { db: options.db, redis: options.redis });
  registerAuthRoutes(app, {
    db: options.db,
    jwtSecret: options.config.jwtSecret,
    jwtExpiresIn: options.config.jwtExpiresIn,
  });
  registerWhiteboardRoutes(app, {
    db: options.db,
    jwtSecret: options.config.jwtSecret,
  });
  registerShareLinkRoutes(app, {
    db: options.db,
    jwtSecret: options.config.jwtSecret,
  });

  attachCollaboration(app.server, collaboration.hocuspocus);

  return {
    app,
    hocuspocus: collaboration.hocuspocus,
    redisExtension: collaboration.redisExtension,
  };
}
