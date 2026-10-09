import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { signAccessToken } from "../auth/jwt.js";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../auth/password.js";
import type { AppDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { ErrorCode, HttpError, isUniqueViolation } from "../errors.js";
import { requireUser } from "../http/principal.js";
import { serializeUser } from "../http/presenter.js";
import { parseInput } from "../http/validate.js";
import { findUserByEmail } from "../services/access.js";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(80),
});

const loginSchema = credentialsSchema;

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { db: AppDb; jwtSecret: string; jwtExpiresIn: string },
): void {
  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = parseInput(registerSchema, request.body);
    const existing = await findUserByEmail(deps.db, body.email);
    if (existing) {
      throw new HttpError(
        409,
        ErrorCode.CONFLICT,
        "An account with this email already exists",
      );
    }

    const passwordHash = await hashPassword(body.password);
    let user;
    try {
      const inserted = await deps.db
        .insert(users)
        .values({
          email: body.email,
          name: body.name,
          passwordHash,
        })
        .returning();
      user = inserted[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(
          409,
          ErrorCode.CONFLICT,
          "An account with this email already exists",
        );
      }
      throw error;
    }

    if (!user) {
      throw new HttpError(
        500,
        ErrorCode.INTERNAL_ERROR,
        "Could not create the account",
      );
    }

    const accessToken = await signAccessToken(
      user.id,
      deps.jwtSecret,
      deps.jwtExpiresIn,
    );
    return reply.status(201).send({
      user: serializeUser(user),
      accessToken,
    });
  });

  app.post("/api/v1/auth/login", async (request) => {
    const body = parseInput(loginSchema, request.body);
    const user = await findUserByEmail(deps.db, body.email);
    const passwordMatches = await verifyPassword(
      body.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      throw new HttpError(
        401,
        ErrorCode.UNAUTHORIZED,
        "Invalid email or password",
      );
    }

    const accessToken = await signAccessToken(
      user.id,
      deps.jwtSecret,
      deps.jwtExpiresIn,
    );
    return {
      user: serializeUser(user),
      accessToken,
    };
  });

  app.get("/api/v1/auth/me", async (request) => {
    const user = await requireUser(request, deps.db, deps.jwtSecret);
    return { user: serializeUser(user) };
  });
}
