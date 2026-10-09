import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createBoard,
  createShareLink,
  createTestApp,
  registerUser,
  resetDatabase,
  shareHeader,
  type TestContext,
} from "./helpers.js";

describe("share permissions", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ ping: async () => "PONG" });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.db);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("reports liveness and readiness", async () => {
    const live = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: "ok" });

    const ready = await ctx.app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });

    const missing = await ctx.app.inject({ method: "GET", url: "/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");
  });

  it("lets the owner create, list, and revoke editor and viewer links", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken);
    const editor = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "editor",
    );
    const viewer = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "viewer",
    );

    expect(editor.role).toBe("editor");
    expect(viewer.role).toBe("viewer");
    expect(editor.token).not.toBe(viewer.token);
    expect(editor.revokedAt).toBeNull();

    const listed = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/whiteboards/${board.id}/share-links`,
      headers: bearer(ada.accessToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(
      listed
        .json()
        .shareLinks.map((link: { role: string }) => link.role)
        .sort(),
    ).toEqual(["editor", "viewer"]);

    const preview = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/share-links/${viewer.token}`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({
      shareLink: {
        boardId: board.id,
        boardTitle: board.title,
        role: "viewer",
      },
    });

    const revoked = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}/share-links/${viewer.id}`,
      headers: bearer(ada.accessToken),
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().shareLink.revokedAt).toEqual(expect.any(String));

    const again = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}/share-links/${viewer.id}`,
      headers: bearer(ada.accessToken),
    });
    expect(again.json().shareLink.revokedAt).toBe(
      revoked.json().shareLink.revokedAt,
    );

    const previewAfter = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/share-links/${viewer.token}`,
    });
    expect(previewAfter.statusCode).toBe(404);
  });

  it("adds a redeemed link to shared-with-me and drops it when the link is revoked", async () => {
    const ada = await registerUser(ctx.app, {
      email: "ada@example.com",
      name: "Ada",
    });
    const grace = await registerUser(ctx.app, {
      email: "grace@example.com",
      name: "Grace",
    });
    const board = await createBoard(ctx.app, ada.accessToken, "Shared retro");
    const editorLink = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "editor",
    );
    const viewerLink = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "viewer",
    );

    const redeemed = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: bearer(grace.accessToken),
      payload: { token: editorLink.token },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json().whiteboard).toMatchObject({
      id: board.id,
      role: "editor",
      owner: { id: ada.user.id, name: "Ada" },
    });

    const shared = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: bearer(grace.accessToken),
    });
    expect(
      shared.json().whiteboards.map((item: { id: string; role: string }) => ({
        id: item.id,
        role: item.role,
      })),
    ).toEqual([{ id: board.id, role: "editor" }]);

    const ownerList = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: bearer(ada.accessToken),
    });
    expect(ownerList.json().whiteboards).toHaveLength(1);
    expect(ownerList.json().whiteboards[0].role).toBe("owner");

    const downgraded = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: bearer(grace.accessToken),
      payload: { token: viewerLink.token },
    });
    expect(downgraded.json().whiteboard.role).toBe("viewer");

    const ownerRedeem = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: bearer(ada.accessToken),
      payload: { token: editorLink.token },
    });
    expect(ownerRedeem.json().whiteboard.role).toBe("owner");

    await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}/share-links/${viewerLink.id}`,
      headers: bearer(ada.accessToken),
    });

    const afterRevoke = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: bearer(grace.accessToken),
    });
    expect(afterRevoke.json().whiteboards).toEqual([]);

    const redeemRevoked = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: bearer(grace.accessToken),
      payload: { token: viewerLink.token },
    });
    expect(redeemRevoked.statusCode).toBe(404);
  });

  it("enforces owner-only management and share-token read access over HTTP", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const grace = await registerUser(ctx.app, { email: "grace@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken, "Managed");
    const other = await createBoard(ctx.app, ada.accessToken, "Other");
    const editorLink = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "editor",
    );
    const viewerLink = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "viewer",
    );

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: bearer(grace.accessToken),
      payload: { token: editorLink.token },
    });

    const editorRename = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: bearer(grace.accessToken),
      payload: { title: "Nope" },
    });
    expect(editorRename.statusCode).toBe(403);
    expect(editorRename.json().error.code).toBe("FORBIDDEN");

    const editorDelete = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: bearer(grace.accessToken),
    });
    expect(editorDelete.statusCode).toBe(403);

    const editorShare = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/whiteboards/${board.id}/share-links`,
      headers: bearer(grace.accessToken),
      payload: { role: "viewer" },
    });
    expect(editorShare.statusCode).toBe(403);

    const withViewerToken = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: shareHeader(viewerLink.token),
    });
    expect(withViewerToken.statusCode).toBe(200);
    expect(withViewerToken.json().whiteboard.role).toBe("viewer");

    const viewerRename = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: shareHeader(viewerLink.token),
      payload: { title: "Viewer edit" },
    });
    expect(viewerRename.statusCode).toBe(403);

    const wrongBoard = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/whiteboards/${other.id}`,
      headers: shareHeader(viewerLink.token),
    });
    expect(wrongBoard.statusCode).toBe(404);

    const listWithShare = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: shareHeader(viewerLink.token),
    });
    expect(listWithShare.statusCode).toBe(401);
    expect(listWithShare.json().error.message).toBe(
      "A user access token is required",
    );
  });
});
