import type { BoardId } from "@whiteboard/shared";
import { ApiError, readApiError } from "./errors";
import type {
  Session,
  ShareLink,
  ShareRole,
  Whiteboard,
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
      throw readApiError(
        response.status,
        payload,
        text || response.statusText || "Request failed",
      );
    }
    return payload as T;
  }

  return {
    register: (input) =>
      request<Session>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    login: (input) =>
      request<Session>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    async logout() {
      // The access token is a stateless JWT. Dropping it locally is enough.
    },
    async listBoards() {
      const body = await request<{ whiteboards: Whiteboard[] }>(
        "/api/v1/whiteboards",
      );
      return body.whiteboards;
    },
    async createBoard(input) {
      const body = await request<{ whiteboard: Whiteboard }>(
        "/api/v1/whiteboards",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      return body.whiteboard;
    },
    async renameBoard(id, title) {
      const body = await request<{ whiteboard: Whiteboard }>(
        `/api/v1/whiteboards/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title }),
        },
      );
      return body.whiteboard;
    },
    async deleteBoard(id) {
      await request<void>(`/api/v1/whiteboards/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async getBoard(id: BoardId) {
      const body = await request<{ whiteboard: Whiteboard }>(
        `/api/v1/whiteboards/${encodeURIComponent(id)}`,
      );
      return body.whiteboard;
    },
    async createShareLink(boardId, role: ShareRole) {
      const body = await request<{ shareLink: ShareLink }>(
        `/api/v1/whiteboards/${encodeURIComponent(boardId)}/share-links`,
        {
          method: "POST",
          body: JSON.stringify({ role }),
        },
      );
      return body.shareLink;
    },
    async listShareLinks(boardId) {
      const body = await request<{ shareLinks: ShareLink[] }>(
        `/api/v1/whiteboards/${encodeURIComponent(boardId)}/share-links`,
      );
      return body.shareLinks;
    },
    async revokeShareLink(boardId, linkId) {
      const body = await request<{ shareLink: ShareLink }>(
        `/api/v1/whiteboards/${encodeURIComponent(boardId)}/share-links/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      );
      return body.shareLink;
    },
    async redeemShareToken(token) {
      const body = await request<{ whiteboard: Whiteboard }>(
        "/api/v1/share-links/redeem",
        {
          method: "POST",
          body: JSON.stringify({ token }),
        },
      );
      return body.whiteboard;
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
