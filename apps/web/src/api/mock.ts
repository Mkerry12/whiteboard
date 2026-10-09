import type { BoardId } from "@whiteboard/shared";
import { ApiError } from "./errors";
import type {
  BoardRole,
  ShareLink,
  User,
  Whiteboard,
  WhiteboardApi,
} from "./types";

export const MOCK_STORAGE_KEY = "whiteboard.mock.v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredUser extends User {
  password: string;
}

interface StoredBoard {
  id: BoardId;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface MockDb {
  users: StoredUser[];
  sessions: { token: string; userId: string }[];
  boards: StoredBoard[];
  shares: ShareLink[];
}

const EMPTY: MockDb = { users: [], sessions: [], boards: [], shares: [] };

export function createMemoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

export function createMockApi(options?: {
  storage?: KeyValueStorage;
  getToken?: () => string | null;
}): WhiteboardApi {
  const storage = options?.storage ?? defaultStorage();
  const getToken = options?.getToken ?? (() => null);

  function load(): MockDb {
    const raw = storage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY);
    try {
      const parsed = JSON.parse(raw) as MockDb;
      return {
        users: parsed.users ?? [],
        sessions: parsed.sessions ?? [],
        boards: parsed.boards ?? [],
        shares: parsed.shares ?? [],
      };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  function save(db: MockDb): void {
    storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
  }

  function requireUser(db: MockDb): StoredUser {
    const token = getToken();
    if (!token) throw new ApiError(401, "Sign in required", "UNAUTHORIZED");
    const session = db.sessions.find((item) => item.token === token);
    const user = db.users.find((item) => item.id === session?.userId);
    if (!user) throw new ApiError(401, "Sign in required", "UNAUTHORIZED");
    return user;
  }

  function publicUser(user: StoredUser): User {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  function publicBoard(
    board: StoredBoard,
    role: BoardRole,
    owner: StoredUser,
  ): Whiteboard {
    return {
      id: board.id,
      title: board.title,
      role,
      owner: { id: owner.id, name: owner.name },
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  return {
    async register(input) {
      const email = cleanEmail(input.email);
      const name = cleanName(input.name, "Name", 80);
      const password = cleanPassword(input.password);
      const db = load();
      if (db.users.some((user) => user.email === email)) {
        throw new ApiError(
          409,
          "An account with this email already exists",
          "CONFLICT",
        );
      }
      const now = new Date().toISOString();
      const user: StoredUser = {
        id: crypto.randomUUID(),
        email,
        name,
        password,
        createdAt: now,
      };
      const accessToken = crypto.randomUUID();
      db.users.push(user);
      db.sessions.push({ token: accessToken, userId: user.id });
      save(db);
      return { accessToken, user: publicUser(user) };
    },

    async login(input) {
      const email = cleanEmail(input.email);
      const password = cleanPassword(input.password);
      const db = load();
      const user = db.users.find((item) => item.email === email);
      if (!user || user.password !== password) {
        throw new ApiError(401, "Invalid email or password", "UNAUTHORIZED");
      }
      const accessToken = crypto.randomUUID();
      db.sessions.push({ token: accessToken, userId: user.id });
      save(db);
      return { accessToken, user: publicUser(user) };
    },

    async logout() {
      const token = getToken();
      if (!token) return;
      const db = load();
      db.sessions = db.sessions.filter((item) => item.token !== token);
      save(db);
    },

    async listBoards() {
      const db = load();
      const user = requireUser(db);
      return db.boards
        .filter((board) => board.ownerId === user.id)
        .map((board) => publicBoard(board, "owner", user))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    async createBoard(input) {
      const title = cleanName(input.title, "Board name", 200);
      const db = load();
      const user = requireUser(db);
      const now = new Date().toISOString();
      const board: StoredBoard = {
        id: crypto.randomUUID(),
        title,
        ownerId: user.id,
        createdAt: now,
        updatedAt: now,
      };
      db.boards.push(board);
      save(db);
      return publicBoard(board, "owner", user);
    },

    async renameBoard(id, title) {
      const nextTitle = cleanName(title, "Board name", 200);
      const db = load();
      const user = requireUser(db);
      const board = ownedBoard(db, user.id, id);
      board.title = nextTitle;
      board.updatedAt = new Date().toISOString();
      save(db);
      return publicBoard(board, "owner", user);
    },

    async deleteBoard(id) {
      const db = load();
      const user = requireUser(db);
      ownedBoard(db, user.id, id);
      db.boards = db.boards.filter((board) => board.id !== id);
      db.shares = db.shares.filter((share) => share.boardId !== id);
      save(db);
    },

    async getBoard(id) {
      const db = load();
      const user = requireUser(db);
      const board = ownedBoard(db, user.id, id);
      return publicBoard(board, "owner", user);
    },

    async createShareLink(boardId, role) {
      const db = load();
      const user = requireUser(db);
      ownedBoard(db, user.id, boardId);
      const link: ShareLink = {
        id: crypto.randomUUID(),
        boardId,
        role,
        token: crypto.randomUUID().replace(/-/g, ""),
        revokedAt: null,
        createdAt: new Date().toISOString(),
      };
      db.shares.push(link);
      save(db);
      return link;
    },

    async listShareLinks(boardId) {
      const db = load();
      const user = requireUser(db);
      ownedBoard(db, user.id, boardId);
      return db.shares
        .filter((share) => share.boardId === boardId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    async revokeShareLink(boardId, linkId) {
      const db = load();
      const user = requireUser(db);
      ownedBoard(db, user.id, boardId);
      const link = db.shares.find(
        (share) => share.id === linkId && share.boardId === boardId,
      );
      if (!link) throw new ApiError(404, "Share link not found", "NOT_FOUND");
      if (!link.revokedAt) link.revokedAt = new Date().toISOString();
      save(db);
      return link;
    },

    async redeemShareToken(token) {
      const db = load();
      requireUser(db);
      const share = db.shares.find((item) => item.token === token);
      if (!share || share.revokedAt) {
        throw new ApiError(404, "Share link not found", "NOT_FOUND");
      }
      const board = db.boards.find((item) => item.id === share.boardId);
      const owner = db.users.find((item) => item.id === board?.ownerId);
      if (!board || !owner) {
        throw new ApiError(404, "Share link not found", "NOT_FOUND");
      }
      return publicBoard(board, share.role, owner);
    },
  };
}

function ownedBoard(db: MockDb, ownerId: string, id: BoardId): StoredBoard {
  const board = db.boards.find((item) => item.id === id);
  if (!board || board.ownerId !== ownerId) {
    throw new ApiError(404, "Whiteboard not found", "NOT_FOUND");
  }
  return board;
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Invalid email", "VALIDATION_ERROR");
  }
  return email;
}

function cleanName(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed)
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  if (trimmed.length > max) {
    throw new ApiError(400, `${label} is too long`, "VALIDATION_ERROR");
  }
  return trimmed;
}

function cleanPassword(value: string): string {
  if (value.length < 8 || value.length > 128) {
    throw new ApiError(
      400,
      "Password must be 8–128 characters",
      "VALIDATION_ERROR",
    );
  }
  return value;
}

function defaultStorage(): KeyValueStorage {
  if (typeof globalThis.localStorage === "undefined")
    return createMemoryStorage();
  return globalThis.localStorage;
}
