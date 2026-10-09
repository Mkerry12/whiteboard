import type { BoardId, BoardParticipant } from "@whiteboard/shared";

export type BoardRole = "edit" | "read";

export interface SessionUser extends BoardParticipant {
  color: string;
}

export interface Session {
  token: string;
  user: SessionUser;
}

export interface BoardSummary {
  id: BoardId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardAccess {
  board: BoardSummary;
  role: BoardRole;
  token: string;
}

export interface ShareLink {
  token: string;
  role: BoardRole;
  boardId: BoardId;
  path: string;
}

export interface Credentials {
  displayName: string;
  password: string;
}

/**
 * HTTP contract the mock client and the real client both implement.
 * Swap `VITE_USE_MOCK=false` and point `VITE_API_URL` at the backend.
 *
 * POST /api/auth/register { displayName, password } -> Session
 * POST /api/auth/login { displayName, password } -> Session
 * POST /api/auth/logout
 * GET /api/boards -> BoardSummary[]
 * POST /api/boards { name } -> BoardSummary
 * PATCH /api/boards/:id { name } -> BoardSummary
 * DELETE /api/boards/:id
 * GET /api/boards/:id -> { board, role }
 * POST /api/boards/:id/shares { role } -> ShareLink
 * POST /api/shares/redeem { token } -> BoardAccess
 *
 * The sync socket is separate: Hocuspocus document name is the board id,
 * and the bearer/share token is the provider token. `user` matches
 * BoardParticipant plus a display color.
 */
export interface WhiteboardApi {
  register(input: Credentials): Promise<Session>;
  login(input: Credentials): Promise<Session>;
  logout(): Promise<void>;
  listBoards(): Promise<BoardSummary[]>;
  createBoard(input: { name: string }): Promise<BoardSummary>;
  renameBoard(id: BoardId, name: string): Promise<BoardSummary>;
  deleteBoard(id: BoardId): Promise<void>;
  getBoard(id: BoardId): Promise<BoardAccess>;
  createShareLink(boardId: BoardId, role: BoardRole): Promise<ShareLink>;
  redeemShareToken(token: string): Promise<BoardAccess>;
}
