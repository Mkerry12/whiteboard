import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createHttpApi } from "../../web/src/api/http.ts";
import { ApiError } from "../../web/src/api/errors.ts";
import {
  collaborationDocumentName,
  collaborationToken,
  shareLinkPath,
} from "../../web/src/api/contract.ts";
import { whiteboards } from "../src/db/schema.js";
import {
  createTestApp,
  listen,
  openCollabProvider,
  resetDatabase,
  waitFor,
  type TestContext,
} from "./helpers.js";

/**
 * Drives the Vue app's HTTP client and the same Hocuspocus token/document
 * names the editor uses, against a listening server. Set LIVE_API_URL and
 * LIVE_SYNC_URL to point this at an already running process instead.
 */
describe("frontend client against the server", () => {
  let ctx: TestContext | null = null;
  let httpUrl = process.env.LIVE_API_URL?.replace(/\/$/, "") ?? "";
  let wsUrl = process.env.LIVE_SYNC_URL ?? "";
  const live = httpUrl.length > 0;
  const opened: Array<{
    provider: ReturnType<typeof openCollabProvider>;
    document: Y.Doc;
  }> = [];

  beforeAll(async () => {
    if (live) return;
    ctx = await createTestApp();
    wsUrl = await listen(ctx.app);
    httpUrl = wsUrl.replace(/^ws:/, "http:").replace(/\/collaboration$/, "");
  });

  beforeEach(async () => {
    if (!ctx) return;
    await resetDatabase(ctx.db);
    ctx.hocuspocus.closeConnections();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  function connect(
    documentName: string,
    token: string,
    onAuthenticationFailed?: (data: { reason: string }) => void,
  ) {
    const document = new Y.Doc();
    const provider = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document,
      token,
      onAuthenticationFailed,
    });
    const entry = { provider, document };
    opened.push(entry);
    return entry;
  }

  function closeClients(): void {
    for (const entry of opened) {
      entry.provider.destroy();
      entry.document.destroy();
    }
    opened.length = 0;
    ctx?.hocuspocus.closeConnections();
  }

  it("registers, syncs, rejects a viewer write, revokes, and reloads", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let adaToken: string | null = null;
    let graceToken: string | null = null;
    const ada = createHttpApi({
      baseUrl: httpUrl,
      getToken: () => adaToken,
    });
    const grace = createHttpApi({
      baseUrl: httpUrl,
      getToken: () => graceToken,
    });

    try {
      const preflight = await fetch(`${httpUrl}/api/v1/auth/login`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5173",
      );

      await expect(ada.listBoards()).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      } satisfies Partial<ApiError>);
      await expect(
        ada.register({
          email: "not-an-email",
          password: "short",
          name: "Ada",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      } satisfies Partial<ApiError>);

      const registered = await ada.register({
        email: `ada-${stamp}@example.com`,
        password: "password123",
        name: "Ada Lovelace",
      });
      adaToken = registered.accessToken;
      expect(registered.user.name).toBe("Ada Lovelace");
      expect(registered.user.email).toBe(`ada-${stamp}@example.com`);

      await expect(
        ada.register({
          email: `Ada-${stamp}@example.com`,
          password: "password123",
          name: "Ada",
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });

      const loggedIn = await ada.login({
        email: `ada-${stamp}@example.com`,
        password: "password123",
      });
      adaToken = loggedIn.accessToken;

      const created = await ada.createBoard({ title: "Sprint board" });
      expect(created.role).toBe("owner");
      expect(created.title).toBe("Sprint board");
      expect((await ada.listBoards()).map((board) => board.id)).toContain(
        created.id,
      );

      const renamed = await ada.renameBoard(created.id, "Renamed board");
      expect(renamed.title).toBe("Renamed board");
      expect((await ada.getBoard(created.id)).title).toBe("Renamed board");

      const editorLink = await ada.createShareLink(created.id, "editor");
      const viewerLink = await ada.createShareLink(created.id, "viewer");
      expect(editorLink.role).toBe("editor");
      expect(viewerLink.revokedAt).toBeNull();
      expect(shareLinkPath(editorLink)).toContain(
        `share=${encodeURIComponent(editorLink.token)}`,
      );
      expect(
        (await ada.listShareLinks(created.id)).some(
          (link) => link.id === editorLink.id,
        ),
      ).toBe(true);

      const graceSession = await grace.register({
        email: `grace-${stamp}@example.com`,
        password: "password123",
        name: "Grace Hopper",
      });
      graceToken = graceSession.accessToken;
      const redeemed = await grace.redeemShareToken(editorLink.token);
      expect(redeemed.id).toBe(created.id);
      expect(redeemed.role).toBe("editor");

      const documentName = collaborationDocumentName(created.id);
      const owner = connect(documentName, collaborationToken("jwt", adaToken));
      const editor = connect(
        documentName,
        collaborationToken("share", editorLink.token),
      );
      await waitFor(() => owner.provider.synced && editor.provider.synced);
      expect(owner.provider.authorizedScope).toBe("read-write");
      expect(editor.provider.authorizedScope).toBe("read-write");
      owner.document.getMap("shapes").set("rect-1", "rect");
      await waitFor(
        () => editor.document.getMap("shapes").get("rect-1") === "rect",
      );
      editor.document.getMap("shapes").set("ellipse-1", "ellipse");
      await waitFor(
        () => owner.document.getMap("shapes").get("ellipse-1") === "ellipse",
      );

      let viewerFailure: { reason: string } | null = null;
      const viewer = connect(
        documentName,
        collaborationToken("share", viewerLink.token),
        (data) => {
          viewerFailure = data;
        },
      );
      await waitFor(() => viewer.provider.synced);
      expect(viewerFailure).toBeNull();
      expect(viewer.provider.authorizedScope).toBe("readonly");
      await waitFor(
        () => viewer.document.getMap("shapes").get("ellipse-1") === "ellipse",
      );
      viewer.document.getMap("shapes").set("evil", "injected");
      await waitFor(() => viewer.provider.hasUnsyncedChanges);
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(owner.document.getMap("shapes").get("evil")).toBeUndefined();
      expect(editor.document.getMap("shapes").get("evil")).toBeUndefined();

      const revoked = await ada.revokeShareLink(created.id, editorLink.id);
      expect(revoked.revokedAt).toBeTruthy();
      editor.provider.destroy();

      let revokedFailure: { reason: string } | null = null;
      connect(
        documentName,
        collaborationToken("share", editorLink.token),
        (data) => {
          revokedFailure = data;
        },
      );
      await waitFor(() => revokedFailure !== null);
      expect(revokedFailure).toEqual({ reason: "unauthorized" });

      let memberFailure: { reason: string } | null = null;
      connect(documentName, collaborationToken("jwt", graceToken), (data) => {
        memberFailure = data;
      });
      await waitFor(() => memberFailure !== null);
      expect(memberFailure).toEqual({ reason: "unauthorized" });

      closeClients();
      if (ctx) {
        for (const document of [...ctx.hocuspocus.documents.values()]) {
          await ctx.hocuspocus.unloadDocument(document);
        }
        await waitFor(async () => {
          const rows = await ctx.db
            .select({ yjsState: whiteboards.yjsState })
            .from(whiteboards)
            .where(eq(whiteboards.id, created.id))
            .limit(1);
          return (rows[0]?.yjsState?.byteLength ?? 0) > 0;
        });
      }

      const refreshed = connect(
        documentName,
        collaborationToken("jwt", adaToken),
      );
      await waitFor(
        () =>
          refreshed.provider.synced &&
          refreshed.document.getMap("shapes").get("rect-1") === "rect" &&
          refreshed.document.getMap("shapes").get("ellipse-1") === "ellipse",
      );

      await ada.deleteBoard(created.id);
      await expect(ada.getBoard(created.id)).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
      await expect(
        grace.redeemShareToken(viewerLink.token),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    } finally {
      closeClients();
    }
  });
});
