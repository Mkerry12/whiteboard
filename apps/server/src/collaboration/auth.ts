import type { AppDb } from "../db/client.js";
import type { BoardRole } from "../db/schema.js";
import { verifyAccessToken } from "../auth/jwt.js";
import { getShareAccess, getUserBoardAccess } from "../services/access.js";
import {
  boardIdFromDocumentName,
  JWT_TOKEN_PREFIX,
  SHARE_TOKEN_PREFIX,
} from "./contract.js";

export class UnauthorizedCollaborationError extends Error {
  readonly reason = "unauthorized";

  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedCollaborationError";
  }
}

export interface CollabContext {
  userId: string | null;
  role: BoardRole;
  boardId: string;
}

export interface ConnectionReadOnlyFlag {
  readOnly: boolean;
}

/**
 * Authorize a Hocuspocus handshake.
 *
 * Viewers are marked read-only on `connectionConfig`. Hocuspocus copies that
 * flag onto the connection after `onAuthenticate` and then ignores Yjs updates
 * from that socket. Throwing rejects the handshake before any document state
 * is sent.
 */
export async function authorizeConnection(
  db: AppDb,
  jwtSecret: string,
  input: {
    token: string;
    documentName: string;
    connectionConfig: ConnectionReadOnlyFlag;
  },
): Promise<CollabContext> {
  const boardId = boardIdFromDocumentName(input.documentName);
  const token = input.token.trim();
  if (!boardId || token.length === 0) {
    throw new UnauthorizedCollaborationError();
  }

  if (token.startsWith(JWT_TOKEN_PREFIX)) {
    const accessToken = token.slice(JWT_TOKEN_PREFIX.length);
    const userId = accessToken
      ? await verifyAccessToken(accessToken, jwtSecret)
      : null;
    if (!userId) {
      throw new UnauthorizedCollaborationError();
    }
    const access = await getUserBoardAccess(db, userId, boardId);
    if (!access) {
      throw new UnauthorizedCollaborationError();
    }
    if (access.role === "viewer") {
      input.connectionConfig.readOnly = true;
    }
    return { userId, role: access.role, boardId };
  }

  if (token.startsWith(SHARE_TOKEN_PREFIX)) {
    const shareToken = token.slice(SHARE_TOKEN_PREFIX.length);
    if (!shareToken) {
      throw new UnauthorizedCollaborationError();
    }
    const access = await getShareAccess(db, shareToken, boardId);
    if (!access) {
      throw new UnauthorizedCollaborationError();
    }
    if (access.role === "viewer") {
      input.connectionConfig.readOnly = true;
    }
    return { userId: null, role: access.role, boardId };
  }

  throw new UnauthorizedCollaborationError();
}
