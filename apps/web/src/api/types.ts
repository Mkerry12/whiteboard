import type { BoardId } from "@whiteboard/shared";

/**
 * App-facing API. Field names match `docs/backend/api.md`.
 * The mock client and `createHttpApi` both implement this interface.
 *
 * POST /api/v1/auth/register { email, password, name } -> { user, accessToken }
 * POST /api/v1/auth/login { email, password } -> { user, accessToken }
 * GET  /api/v1/whiteboards -> { whiteboards }
 * POST /api/v1/whiteboards { title } -> { whiteboard }
 * GET  /api/v1/whiteboards/:boardId -> { whiteboard }
 * PATCH /api/v1/whiteboards/:boardId { title } -> { whiteboard }
 * DELETE /api/v1/whiteboards/:boardId
 * POST /api/v1/whiteboards/:boardId/share-links { role } -> { shareLink }
 * GET  /api/v1/whiteboards/:boardId/share-links -> { shareLinks }
 * DELETE /api/v1/whiteboards/:boardId/share-links/:linkId -> { shareLink }
 * POST /api/v1/share-links/redeem { token } -> { whiteboard }
 *
 * Collaboration (separate from these methods): document `whiteboard:<boardId>`,
 * provider token `jwt:<accessToken>` or `share:<shareToken>`.
 * Logout is local. Access tokens are stateless JWTs, so there is no logout route.
 */

export type ShareRole = "editor" | "viewer";
export type BoardRole = "owner" | ShareRole;

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Session {
  user: User;
  accessToken: string;
}

export interface Whiteboard {
  id: BoardId;
  title: string;
  role: BoardRole;
  owner: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

/** Open board plus the Hocuspocus provider token (`jwt:` or `share:`). */
export interface BoardAccess {
  board: Whiteboard;
  role: BoardRole;
  token: string;
}

export interface ShareLink {
  id: string;
  boardId: BoardId;
  role: ShareRole;
  token: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface WhiteboardApi {
  register(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<Session>;
  login(input: { email: string; password: string }): Promise<Session>;
  logout(): Promise<void>;
  listBoards(): Promise<Whiteboard[]>;
  createBoard(input: { title: string }): Promise<Whiteboard>;
  renameBoard(id: BoardId, title: string): Promise<Whiteboard>;
  deleteBoard(id: BoardId): Promise<void>;
  getBoard(id: BoardId): Promise<Whiteboard>;
  createShareLink(boardId: BoardId, role: ShareRole): Promise<ShareLink>;
  listShareLinks(boardId: BoardId): Promise<ShareLink[]>;
  revokeShareLink(boardId: BoardId, linkId: string): Promise<ShareLink>;
  redeemShareToken(token: string): Promise<Whiteboard>;
}
