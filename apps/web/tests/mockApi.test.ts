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
      displayName: "Ada",
      password: "secret",
    });
    setToken(session.token);
    expect(session.user.displayName).toBe("Ada");
    const board = await api.createBoard({ name: "Studio" });
    await api.renameBoard(board.id, "Studio 2");
    expect((await api.listBoards())[0]?.name).toBe("Studio 2");
    await api.deleteBoard(board.id);
    expect(await api.listBoards()).toEqual([]);
  });

  it("issues edit and read-only share links", async () => {
    const { api, setToken } = client();
    const session = await api.register({
      displayName: "Ada",
      password: "secret",
    });
    setToken(session.token);
    const board = await api.createBoard({ name: "Shared" });
    const edit = await api.createShareLink(board.id, "edit");
    const read = await api.createShareLink(board.id, "read");
    expect((await api.redeemShareToken(edit.token)).role).toBe("edit");
    expect((await api.redeemShareToken(read.token)).role).toBe("read");
    await expect(api.redeemShareToken("missing")).rejects.toThrow(/not valid/i);
  });

  it("rejects a bad login and a duplicate registration", async () => {
    const { api } = client();
    await api.register({ displayName: "Ada", password: "secret" });
    await expect(
      api.register({ displayName: "Ada", password: "secret" }),
    ).rejects.toThrow(/already registered/i);
    await expect(
      api.login({ displayName: "Ada", password: "nope" }),
    ).rejects.toThrow(/incorrect/i);
  });
});
