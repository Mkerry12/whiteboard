import type { BoardId } from "@whiteboard/shared";
import { ApiError } from "./errors";
import type {
  BoardAccess,
  BoardRole,
  BoardSummary,
  Session,
  ShareLink,
  WhiteboardApi,
} from "./types";

export function createHttpApi(options: {
  baseUrl: string;
  getToken?: () => string | null;
}): WhiteboardApi {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const getToken = options.getToken ?? (() => null);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, "Cannot reach the API");
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const payload = text ? parseJson(text) : null;
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : text || response.statusText;
      throw new ApiError(response.status, message);
    }
    return payload as T;
  }

  return {
    register: (input) =>
      request<Session>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    login: (input) =>
      request<Session>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    listBoards: () => request<BoardSummary[]>("/api/boards"),
    createBoard: (input) =>
      request<BoardSummary>("/api/boards", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    renameBoard: (id, name) =>
      request<BoardSummary>(`/api/boards/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    deleteBoard: (id) =>
      request<void>(`/api/boards/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    async getBoard(id: BoardId) {
      const data = await request<{ board: BoardSummary; role: BoardRole }>(
        `/api/boards/${encodeURIComponent(id)}`,
      );
      const token = getToken();
      if (!token) throw new ApiError(401, "Sign in required");
      return { board: data.board, role: data.role, token };
    },
    createShareLink: (boardId, role) =>
      request<ShareLink>(`/api/boards/${encodeURIComponent(boardId)}/shares`, {
        method: "POST",
        body: JSON.stringify({ role }),
      }),
    redeemShareToken: (token) =>
      request<BoardAccess>("/api/shares/redeem", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
