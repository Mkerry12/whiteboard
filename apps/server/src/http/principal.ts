import type { FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/jwt.js";
import { ErrorCode, HttpError } from "../errors.js";
import {
  findUserById,
  getShareAccess,
  getUserBoardAccess,
  type AccessibleBoard,
} from "../services/access.js";
import type { AppDb } from "../db/client.js";
import type { UserRow } from "../db/schema.js";

export type Principal =
  { kind: "user"; user: UserRow } | { kind: "share"; token: string };

export async function readPrincipal(
  request: FastifyRequest,
  db: AppDb,
  jwtSecret: string,
): Promise<Principal> {
  const header = request.headers.authorization;
  if (!header) {
    throw new HttpError(
      401,
      ErrorCode.UNAUTHORIZED,
      "Missing Authorization header",
    );
  }

  const separator = header.indexOf(" ");
  const scheme = separator === -1 ? header : header.slice(0, separator);
  const value = separator === -1 ? "" : header.slice(separator + 1).trim();
  if (!value) {
    throw new HttpError(
      401,
      ErrorCode.UNAUTHORIZED,
      "Missing authorization credentials",
    );
  }

  if (scheme === "Bearer") {
    const userId = await verifyAccessToken(value, jwtSecret);
    if (!userId) {
      throw new HttpError(
        401,
        ErrorCode.UNAUTHORIZED,
        "Invalid or expired access token",
      );
    }
    const user = await findUserById(db, userId);
    if (!user) {
      throw new HttpError(
        401,
        ErrorCode.UNAUTHORIZED,
        "Invalid or expired access token",
      );
    }
    return { kind: "user", user };
  }

  if (scheme === "Share") {
    return { kind: "share", token: value };
  }

  throw new HttpError(
    401,
    ErrorCode.UNAUTHORIZED,
    "Unsupported authorization scheme",
  );
}

export async function requireUser(
  request: FastifyRequest,
  db: AppDb,
  jwtSecret: string,
): Promise<UserRow> {
  const principal = await readPrincipal(request, db, jwtSecret);
  if (principal.kind !== "user") {
    throw new HttpError(
      401,
      ErrorCode.UNAUTHORIZED,
      "A user access token is required",
    );
  }
  return principal.user;
}

export async function requireBoardAccess(
  request: FastifyRequest,
  db: AppDb,
  jwtSecret: string,
  boardId: string,
): Promise<AccessibleBoard> {
  const principal = await readPrincipal(request, db, jwtSecret);
  const access =
    principal.kind === "user"
      ? await getUserBoardAccess(db, principal.user.id, boardId)
      : await getShareAccess(db, principal.token, boardId);
  if (!access) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, "Whiteboard not found");
  }
  return access;
}

export async function requireOwner(
  request: FastifyRequest,
  db: AppDb,
  jwtSecret: string,
  boardId: string,
): Promise<AccessibleBoard> {
  const access = await requireBoardAccess(request, db, jwtSecret, boardId);
  if (access.role !== "owner") {
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only the owner can manage this whiteboard",
    );
  }
  return access;
}
