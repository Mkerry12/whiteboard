import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  documentNameForBoard,
  formatJwtCollabToken,
  formatShareCollabToken,
} from "../src/collaboration/contract.js";
import { whiteboards } from "../src/db/schema.js";
import {
  createTestApp,
  listen,
  openCollabProvider,
  resetDatabase,
  waitFor,
  type TestContext,
} from "./helpers.js";

describe("core client flow", () => {
  let ctx: TestContext;
  let wsUrl = "";

  beforeAll(async () => {
    ctx = await createTestApp();
    wsUrl = await listen(ctx.app);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.hocuspocus.closeConnections();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("registers, collaborates, revokes a share link, and keeps a refresh", async () => {
    const anon = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
    });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error.code).toBe("UNAUTHORIZED");

    const registered = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "ada@example.com",
        password: "password123",
        name: "Ada Lovelace",
      },
    });
    expect(registered.statusCode).toBe(201);
    const ada = registered.json();

    const loggedIn = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ada@example.com", password: "password123" },
    });
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().user.email).toBe("ada@example.com");

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/whiteboards",
      headers: { authorization: `Bearer ${ada.accessToken}` },
      payload: { title: "Sprint board" },
    });
    expect(created.statusCode).toBe(201);
    const board = created.json().whiteboard;
    expect(board.role).toBe("owner");

    const listed = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/whiteboards",
      headers: { authorization: `Bearer ${ada.accessToken}` },
    });
    expect(
      listed.json().whiteboards.map((item: { title: string }) => item.title),
    ).toEqual(["Sprint board"]);

    const renamed = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: { authorization: `Bearer ${ada.accessToken}` },
      payload: { title: "Renamed board" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().whiteboard.title).toBe("Renamed board");

    const editorLink = (
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/whiteboards/${board.id}/share-links`,
        headers: { authorization: `Bearer ${ada.accessToken}` },
        payload: { role: "editor" },
      })
    ).json().shareLink;
    const viewerLink = (
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/whiteboards/${board.id}/share-links`,
        headers: { authorization: `Bearer ${ada.accessToken}` },
        payload: { role: "viewer" },
      })
    ).json().shareLink;

    const grace = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "grace@example.com",
          password: "password123",
          name: "Grace Hopper",
        },
      })
    ).json();
    const redeemed = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: { authorization: `Bearer ${grace.accessToken}` },
      payload: { token: editorLink.token },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json().whiteboard.role).toBe("editor");
    expect(redeemed.json().whiteboard.id).toBe(board.id);

    const documentName = documentNameForBoard(board.id);
    const ownerDoc = new Y.Doc();
    const editorDoc = new Y.Doc();
    const viewerDoc = new Y.Doc();
    const owner = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document: ownerDoc,
      token: formatJwtCollabToken(ada.accessToken),
    });
    const editor = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document: editorDoc,
      token: formatShareCollabToken(editorLink.token),
    });
    await waitFor(() => owner.synced && editor.synced);
    expect(owner.authorizedScope).toBe("read-write");
    expect(editor.authorizedScope).toBe("read-write");
    ownerDoc.getMap("shapes").set("rect-1", "rect");
    await waitFor(() => editorDoc.getMap("shapes").get("rect-1") === "rect");
    editorDoc.getMap("shapes").set("ellipse-1", "ellipse");
    await waitFor(
      () => ownerDoc.getMap("shapes").get("ellipse-1") === "ellipse",
    );

    let viewerFailure: { reason: string } | null = null;
    const viewer = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document: viewerDoc,
      token: formatShareCollabToken(viewerLink.token),
      onAuthenticationFailed: (data) => {
        viewerFailure = data;
      },
    });
    await waitFor(() => viewer.synced);
    expect(viewerFailure).toBeNull();
    expect(viewer.authorizedScope).toBe("readonly");
    await waitFor(
      () => viewerDoc.getMap("shapes").get("ellipse-1") === "ellipse",
    );
    viewerDoc.getMap("shapes").set("evil", "injected");
    await waitFor(() => viewer.hasUnsyncedChanges);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(ownerDoc.getMap("shapes").get("evil")).toBeUndefined();

    const revoked = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}/share-links/${editorLink.id}`,
      headers: { authorization: `Bearer ${ada.accessToken}` },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().shareLink.revokedAt).toBeTruthy();

    editor.destroy();
    const afterRevokeDoc = new Y.Doc();
    let revokedFailure: { reason: string } | null = null;
    const afterRevoke = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document: afterRevokeDoc,
      token: formatShareCollabToken(editorLink.token),
      onAuthenticationFailed: (data) => {
        revokedFailure = data;
      },
    });
    await waitFor(() => revokedFailure !== null);
    expect(revokedFailure).toEqual({ reason: "unauthorized" });

    owner.destroy();
    viewer.destroy();
    afterRevoke.destroy();
    ownerDoc.destroy();
    editorDoc.destroy();
    viewerDoc.destroy();
    afterRevokeDoc.destroy();

    ctx.hocuspocus.closeConnections();
    for (const document of [...ctx.hocuspocus.documents.values()]) {
      await ctx.hocuspocus.unloadDocument(document);
    }
    await waitFor(async () => {
      const rows = await ctx.db
        .select({ yjsState: whiteboards.yjsState })
        .from(whiteboards)
        .where(eq(whiteboards.id, board.id))
        .limit(1);
      return (rows[0]?.yjsState?.byteLength ?? 0) > 0;
    });

    const refreshedDoc = new Y.Doc();
    const refreshed = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document: refreshedDoc,
      token: formatJwtCollabToken(ada.accessToken),
    });
    await waitFor(
      () =>
        refreshed.synced &&
        refreshedDoc.getMap("shapes").get("rect-1") === "rect",
    );
    refreshed.destroy();
    refreshedDoc.destroy();

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: { authorization: `Bearer ${ada.accessToken}` },
    });
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe("");
    const missing = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/whiteboards/${board.id}`,
      headers: { authorization: `Bearer ${ada.accessToken}` },
    });
    expect(missing.statusCode).toBe(404);
    const redeemedAgain = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: { authorization: `Bearer ${grace.accessToken}` },
      payload: { token: viewerLink.token },
    });
    expect(redeemedAgain.statusCode).toBe(404);
  });
});
