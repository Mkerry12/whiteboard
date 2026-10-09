import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createBoard,
  createTestApp,
  registerUser,
  resetDatabase,
  type TestContext,
} from "./helpers.js";

describe("whiteboards", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.db);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates, lists, renames, and deletes a board the caller owns", async () => {
    const ada = await registerUser(ctx.app, {
      email: "ada@example.com",
      name: "Ada",
    });
    const created = await createBoard(ctx.app, ada.accessToken, "Sprint board");
    expect(created).toMatchObject({
      title: "Sprint board",
      role: "owner",
      owner: { id: ada.user.id, name: "Ada" },
    });

    const listed = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: bearer(ada.accessToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().whiteboards).toEqual([created]);

    const fetched = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/whiteboards/${created.id}`,
      headers: bearer(ada.accessToken),
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().whiteboard).toEqual(created);

    const renamed = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/whiteboards/${created.id}`,
      headers: bearer(ada.accessToken),
      payload: { title: "  Retro  " },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().whiteboard.title).toBe("Retro");
    expect(renamed.json().whiteboard.role).toBe("owner");

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${created.id}`,
      headers: bearer(ada.accessToken),
    });
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe("");

    const afterDelete = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/whiteboards/${created.id}`,
      headers: bearer(ada.accessToken),
    });
    expect(afterDelete.statusCode).toBe(404);
    expect(afterDelete.json().error.code).toBe("NOT_FOUND");
  });

  it("hides boards the caller cannot access", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const grace = await registerUser(ctx.app, {
      email: "grace@example.com",
      name: "Grace",
    });
    const board = await createBoard(ctx.app, ada.accessToken, "Private");

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: bearer(grace.accessToken),
    });
    expect(list.json().whiteboards).toEqual([]);

    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const response = await ctx.app.inject({
        method,
        url: `/api/v1/whiteboards/${board.id}`,
        headers: bearer(grace.accessToken),
        payload: method === "PATCH" ? { title: "Stolen" } : undefined,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    }
  });

  it("rejects malformed board ids and empty titles", async () => {
    const ada = await registerUser(ctx.app);

    const badId = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards/not-a-uuid",
      headers: bearer(ada.accessToken),
    });
    expect(badId.statusCode).toBe(400);
    expect(badId.json().error.code).toBe("VALIDATION_ERROR");

    const empty = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/whiteboards",
      headers: bearer(ada.accessToken),
      payload: { title: "   " },
    });
    expect(empty.statusCode).toBe(400);
  });
});
