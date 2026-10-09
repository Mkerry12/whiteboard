import type { BoardId } from "@whiteboard/shared";
import { ApiError } from "./errors";
import type {
  BoardAccess,
  BoardRole,
  BoardSummary,
  SessionUser,
  ShareLink,
  WhiteboardApi,
} from "./types";
import { colorFromId } from "../theme/palette";

export const MOCK_STORAGE_KEY = "whiteboard.mock.v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredUser extends SessionUser {
  password: string;
}

interface StoredBoard extends BoardSummary {
  ownerId: string;
}

interface MockDb {
  users: StoredUser[];
  sessions: { token: string; userId: string }[];
  boards: StoredBoard[];
  shares: { token: string; boardId: BoardId; role: BoardRole }[];
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
    if (!token) throw new ApiError(401, "Sign in required");
    const session = db.sessions.find((item) => item.token === token);
    const user = db.users.find((item) => item.id === session?.userId);
    if (!user) throw new ApiError(401, "Sign in required");
    return user;
  }

  function publicUser(user: StoredUser): SessionUser {
    return { id: user.id, displayName: user.displayName, color: user.color };
  }

  function publicBoard(board: StoredBoard): BoardSummary {
    return {
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  return {
    async register(input) {
      const displayName = cleanName(input.displayName, "Name");
      const password = cleanPassword(input.password);
      const db = load();
      if (
        db.users.some(
          (user) =>
            user.displayName.toLowerCase() === displayName.toLowerCase(),
        )
      ) {
        throw new ApiError(409, "That name is already registered");
      }
      const user: StoredUser = {
        id: crypto.randomUUID(),
        displayName,
        password,
        color: colorFromId(displayName),
      };
      const token = crypto.randomUUID();
      db.users.push(user);
      db.sessions.push({ token, userId: user.id });
      save(db);
      return { token, user: publicUser(user) };
    },

    async login(input) {
      const displayName = cleanName(input.displayName, "Name");
      const password = cleanPassword(input.password);
      const db = load();
      const user = db.users.find(
        (item) => item.displayName.toLowerCase() === displayName.toLowerCase(),
      );
      if (!user || user.password !== password) {
        throw new ApiError(401, "Name or password is incorrect");
      }
      const token = crypto.randomUUID();
      db.sessions.push({ token, userId: user.id });
      save(db);
      return { token, user: publicUser(user) };
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
        .map(publicBoard)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    async createBoard(input) {
      const name = cleanName(input.name, "Board name");
      const db = load();
      const user = requireUser(db);
      const now = new Date().toISOString();
      const board: StoredBoard = {
        id: crypto.randomUUID(),
        name,
        ownerId: user.id,
        createdAt: now,
        updatedAt: now,
      };
      db.boards.push(board);
      save(db);
      return publicBoard(board);
    },

    async renameBoard(id, name) {
      const nextName = cleanName(name, "Board name");
      const db = load();
      const user = requireUser(db);
      const board = ownedBoard(db, user.id, id);
      board.name = nextName;
      board.updatedAt = new Date().toISOString();
      save(db);
      return publicBoard(board);
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
      const token = getToken();
      if (!token) throw new ApiError(401, "Sign in required");
      return { board: publicBoard(board), role: "edit", token };
    },

    async createShareLink(boardId, role) {
      const db = load();
      const user = requireUser(db);
      ownedBoard(db, user.id, boardId);
      const token = crypto.randomUUID();
      db.shares.push({ token, boardId, role });
      save(db);
      const link: ShareLink = {
        token,
        role,
        boardId,
        path: `/boards/${boardId}?share=${token}`,
      };
      return link;
    },

    async redeemShareToken(token) {
      const db = load();
      const share = db.shares.find((item) => item.token === token);
      if (!share) throw new ApiError(404, "This share link is not valid");
      const board = db.boards.find((item) => item.id === share.boardId);
      if (!board) throw new ApiError(404, "This board is gone");
      const access: BoardAccess = {
        board: publicBoard(board),
        role: share.role,
        token: share.token,
      };
      return access;
    },
  };
}

function ownedBoard(db: MockDb, ownerId: string, id: BoardId): StoredBoard {
  const board = db.boards.find((item) => item.id === id);
  if (!board || board.ownerId !== ownerId) {
    throw new ApiError(404, "Board not found");
  }
  return board;
}

function cleanName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ApiError(400, `${label} is required`);
  if (trimmed.length > 80) throw new ApiError(400, `${label} is too long`);
  return trimmed;
}

function cleanPassword(value: string): string {
  if (value.trim().length < 4) {
    throw new ApiError(400, "Password must be at least 4 characters");
  }
  return value;
}

function defaultStorage(): KeyValueStorage {
  if (typeof globalThis.localStorage === "undefined")
    return createMemoryStorage();
  return globalThis.localStorage;
}
