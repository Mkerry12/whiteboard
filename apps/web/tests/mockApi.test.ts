import { describe, expect, it } from "vitest";
import { createMemoryStorage, createMockApi } from "../src/api/mock";

function client() {
  let token: string | null = null;
  const api = createMockApi({
    storage: createMemoryStorage(),
    getToken: () => token,
  });
  return {
    api,
    setToken(next: string | null) {
      token = next;
    },
  };
}

describe("mock API", () => {
  it("registers, lists, renames, and deletes boards", async () => {
    const { api, setToken } = client();
    const session = await api.register({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
    });
    setToken(session.accessToken);
    expect(session.user.name).toBe("Ada");
    expect(session.user.email).toBe("ada@example.com");
    const board = await api.createBoard({ title: "Studio" });
    await api.renameBoard(board.id, "Studio 2");
    expect((await api.listBoards())[0]?.title).toBe("Studio 2");
    await api.deleteBoard(board.id);
    expect(await api.listBoards()).toEqual([]);
  });

  it("issues editor and viewer share links and revokes them", async () => {
    const { api, setToken } = client();
    const session = await api.register({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
    });
    setToken(session.accessToken);
    const board = await api.createBoard({ title: "Shared" });
    const editor = await api.createShareLink(board.id, "editor");
    const viewer = await api.createShareLink(board.id, "viewer");
    expect((await api.redeemShareToken(editor.token)).role).toBe("editor");
    expect((await api.redeemShareToken(viewer.token)).role).toBe("viewer");
    const revoked = await api.revokeShareLink(board.id, viewer.id);
    expect(revoked.revokedAt).toBeTruthy();
    await expect(api.redeemShareToken(viewer.token)).rejects.toThrow(
      /not found/i,
    );
    await expect(api.redeemShareToken("missing")).rejects.toThrow(/not found/i);
  });

  it("rejects a bad login and a duplicate registration", async () => {
    const { api } = client();
    await api.register({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
    });
    await expect(
      api.register({
        email: "Ada@example.com",
        name: "Ada",
        password: "password123",
      }),
    ).rejects.toThrow(/already exists/i);
    await expect(
      api.login({ email: "ada@example.com", password: "wrong-password" }),
    ).rejects.toThrow(/invalid email or password/i);
  });
});
