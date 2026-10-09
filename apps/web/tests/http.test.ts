import { afterEach, describe, expect, it } from "vitest";
import { createHttpApi } from "../src/api/http";
import { ApiError } from "../src/api/errors";

interface Call {
  url: string;
  init?: RequestInit;
}

const calls: Call[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls.length = 0;
});

function install(handler: (call: Call) => Response | Promise<Response>): void {
  globalThis.fetch = async (input, init) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const user = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-10-09T00:00:00.000Z",
};

const whiteboard = {
  id: "board-1",
  title: "Sprint",
  role: "owner",
  owner: { id: "user-1", name: "Ada" },
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
};

describe("HTTP API client", () => {
  it("registers and logs in with the backend field names", async () => {
    install((call) => {
      if (call.url.endsWith("/api/v1/auth/register")) {
        return json(201, { user, accessToken: "jwt-1" });
      }
      return json(200, { user, accessToken: "jwt-2" });
    });
    const api = createHttpApi({ baseUrl: "http://localhost:3000/" });
    const registered = await api.register({
      email: "ada@example.com",
      password: "password123",
      name: "Ada",
    });
    expect(registered.accessToken).toBe("jwt-1");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      email: "ada@example.com",
      password: "password123",
      name: "Ada",
    });
    const loggedIn = await api.login({
      email: "ada@example.com",
      password: "password123",
    });
    expect(loggedIn.accessToken).toBe("jwt-2");
    expect(calls[1]?.url).toBe("http://localhost:3000/api/v1/auth/login");
    expect(calls[1]?.init?.method).toBe("POST");
  });

  it("unwraps whiteboard and share-link envelopes and sends the bearer token", async () => {
    let token: string | null = "jwt-1";
    install((call) => {
      expect(call.init?.headers).toBeInstanceOf(Headers);
      expect((call.init?.headers as Headers).get("Authorization")).toBe(
        "Bearer jwt-1",
      );
      if (
        call.url.endsWith("/api/v1/whiteboards") &&
        call.init?.method === "POST"
      ) {
        return json(201, { whiteboard });
      }
      if (call.url.endsWith("/api/v1/whiteboards")) {
        return json(200, { whiteboards: [whiteboard] });
      }
      if (call.url.endsWith("/share-links") && call.init?.method === "POST") {
        return json(201, {
          shareLink: {
            id: "link-1",
            boardId: "board-1",
            role: "editor",
            token: "share-token",
            revokedAt: null,
            createdAt: whiteboard.createdAt,
          },
        });
      }
      if (call.url.endsWith("/share-links/link-1")) {
        return json(200, {
          shareLink: {
            id: "link-1",
            boardId: "board-1",
            role: "viewer",
            token: "share-token",
            revokedAt: "2026-10-09T01:00:00.000Z",
            createdAt: whiteboard.createdAt,
          },
        });
      }
      if (call.url.endsWith("/api/v1/share-links/redeem")) {
        return json(200, {
          whiteboard: { ...whiteboard, role: "editor" },
        });
      }
      if (call.init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (call.init?.method === "PATCH") {
        return json(200, { whiteboard: { ...whiteboard, title: "Renamed" } });
      }
      return json(200, { whiteboard });
    });
    const api = createHttpApi({
      baseUrl: "http://localhost:3000",
      getToken: () => token,
    });
    expect((await api.listBoards())[0]?.title).toBe("Sprint");
    expect((await api.createBoard({ title: "Sprint" })).role).toBe("owner");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      title: "Sprint",
    });
    expect((await api.renameBoard("board-1", "Renamed")).title).toBe("Renamed");
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({
      title: "Renamed",
    });
    await api.deleteBoard("board-1");
    expect(calls[3]?.init?.method).toBe("DELETE");
    expect((await api.getBoard("board-1")).id).toBe("board-1");
    const link = await api.createShareLink("board-1", "editor");
    expect(link.token).toBe("share-token");
    expect(JSON.parse(String(calls[5]?.init?.body))).toEqual({
      role: "editor",
    });
    const revoked = await api.revokeShareLink("board-1", "link-1");
    expect(revoked.revokedAt).toBeTruthy();
    expect((await api.redeemShareToken("share-token")).role).toBe("editor");
    token = null;
    await api.logout();
    expect(calls).toHaveLength(8);
  });

  it("reads the error envelope, including field details", async () => {
    install(() =>
      json(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [{ path: "password", message: "Too small" }],
        },
      }),
    );
    const api = createHttpApi({ baseUrl: "http://localhost:3000" });
    await expect(
      api.login({ email: "ada@example.com", password: "short" }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed (password: Too small)",
    } satisfies Partial<ApiError>);
  });
});
