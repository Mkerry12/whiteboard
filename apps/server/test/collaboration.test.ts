import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Connection } from "@hocuspocus/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import * as Y from "yjs";
import type { CollabContext } from "../src/collaboration/auth.js";
import {
  documentNameForBoard,
  formatJwtCollabToken,
  formatShareCollabToken,
} from "../src/collaboration/contract.js";
import { whiteboards } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import {
  createBoard,
  createShareLink,
  createTestApp,
  listen,
  openCollabProvider,
  registerUser,
  resetDatabase,
  waitFor,
  type TestContext,
} from "./helpers.js";

interface OpenedProvider {
  document: Y.Doc;
  provider: HocuspocusProvider;
  authFailure: { reason: string } | null;
}

describe("collaboration", () => {
  let ctx: TestContext;
  let wsUrl = "";
  const opened: OpenedProvider[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    wsUrl = await listen(ctx.app);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.db);
  });

  afterEach(async () => {
    for (const connection of opened) {
      connection.provider.destroy();
      connection.document.destroy();
    }
    opened.length = 0;
    ctx.hocuspocus.closeConnections();
    const documents = [...ctx.hocuspocus.documents.values()];
    for (const document of documents) {
      await ctx.hocuspocus.unloadDocument(document);
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  function connect(documentName: string, token: string): OpenedProvider {
    const document = new Y.Doc();
    const openedProvider: OpenedProvider = {
      document,
      provider: undefined as unknown as HocuspocusProvider,
      authFailure: null,
    };
    openedProvider.provider = openCollabProvider({
      url: wsUrl,
      name: documentName,
      document,
      token,
      onAuthenticationFailed: (data) => {
        openedProvider.authFailure = data;
      },
    });
    opened.push(openedProvider);
    return openedProvider;
  }

  async function waitUntilSynced(connection: OpenedProvider): Promise<void> {
    await waitFor(
      () => connection.provider.synced && connection.provider.isAuthenticated,
    );
  }

  async function serverShapes(
    documentName: string,
  ): Promise<Record<string, unknown>> {
    const direct = await ctx.hocuspocus.openDirectConnection(documentName);
    let shapes: Record<string, unknown> = {};
    await direct.transact((document) => {
      shapes = document.getMap("shapes").toJSON();
    });
    await direct.disconnect();
    return shapes;
  }

  function shapes(document: Y.Doc): Y.Map<string> {
    return document.getMap("shapes");
  }

  it("syncs editor writes and rejects a viewer write on the server", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken, "Live");
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
    const documentName = documentNameForBoard(board.id);

    const owner = connect(documentName, formatJwtCollabToken(ada.accessToken));
    await waitUntilSynced(owner);
    expect(owner.provider.authorizedScope).toBe("read-write");
    shapes(owner.document).set("shape-1", "rect");

    const editor = connect(
      documentName,
      formatShareCollabToken(editorLink.token),
    );
    await waitUntilSynced(editor);
    await waitFor(() => shapes(editor.document).get("shape-1") === "rect");
    expect(editor.provider.authorizedScope).toBe("read-write");
    shapes(editor.document).set("shape-2", "ellipse");
    await waitFor(() => shapes(owner.document).get("shape-2") === "ellipse");

    const viewer = connect(
      documentName,
      formatShareCollabToken(viewerLink.token),
    );
    await waitUntilSynced(viewer);
    await waitFor(() => shapes(viewer.document).get("shape-2") === "ellipse");
    expect(viewer.provider.authorizedScope).toBe("readonly");
    expect(viewer.provider.hasUnsyncedChanges).toBe(false);

    await waitFor(() => {
      const document = ctx.hocuspocus.documents.get(documentName);
      return (document?.getConnections().length ?? 0) >= 3;
    });
    const connections =
      ctx.hocuspocus.documents.get(documentName)?.getConnections() ?? [];
    const viewerConnection = connections.find((connection: Connection) => {
      return (connection.context as CollabContext).role === "viewer";
    });
    expect(viewerConnection?.readOnly).toBe(true);
    const writers = connections.filter((connection: Connection) => {
      return (connection.context as CollabContext).role !== "viewer";
    });
    expect(writers.length).toBeGreaterThan(0);
    expect(writers.every((connection) => connection.readOnly === false)).toBe(
      true,
    );

    shapes(viewer.document).set("evil", "injected");
    await waitFor(() => viewer.provider.hasUnsyncedChanges);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(shapes(owner.document).get("evil")).toBeUndefined();
    expect(shapes(editor.document).get("evil")).toBeUndefined();
    const stored = await serverShapes(documentName);
    expect(stored).toMatchObject({ "shape-1": "rect", "shape-2": "ellipse" });
    expect(stored).not.toHaveProperty("evil");
    expect(shapes(viewer.document).get("shape-1")).toBe("rect");
  });

  it("rejects unauthorized handshakes before applying document updates", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const grace = await registerUser(ctx.app, { email: "grace@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken);
    const other = await createBoard(ctx.app, ada.accessToken, "Other");
    const viewerLink = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "viewer",
    );
    await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}/share-links/${viewerLink.id}`,
      headers: { authorization: `Bearer ${ada.accessToken}` },
    });

    const cases = [
      ["missing prefix", documentNameForBoard(board.id), "not-a-token"],
      [
        "other user",
        documentNameForBoard(board.id),
        formatJwtCollabToken(grace.accessToken),
      ],
      [
        "revoked share",
        documentNameForBoard(board.id),
        formatShareCollabToken(viewerLink.token),
      ],
      [
        "wrong board",
        documentNameForBoard(other.id),
        formatShareCollabToken(viewerLink.token),
      ],
      ["bad document", "board:nope", formatJwtCollabToken(ada.accessToken)],
    ] as const;

    for (const [label, documentName, token] of cases) {
      const connection = connect(documentName, token);
      await waitFor(() => connection.authFailure !== null, 4000);
      expect(connection.authFailure, label).toEqual({ reason: "unauthorized" });
      expect(connection.provider.isAuthenticated, label).toBe(false);
      connection.provider.destroy();
    }

    expect(ctx.hocuspocus.documents.size).toBe(0);
  });

  it("persists Yjs state and reloads it for the next connection", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken);
    const documentName = documentNameForBoard(board.id);
    const owner = connect(documentName, formatJwtCollabToken(ada.accessToken));
    await waitUntilSynced(owner);
    shapes(owner.document).set("shape-1", "sticky");
    await waitFor(
      async () => (await serverShapes(documentName))["shape-1"] === "sticky",
    );
    owner.provider.destroy();

    await waitFor(async () => {
      const rows = await ctx.db
        .select({ yjsState: whiteboards.yjsState })
        .from(whiteboards)
        .where(eq(whiteboards.id, board.id))
        .limit(1);
      return (rows[0]?.yjsState?.byteLength ?? 0) > 0;
    });

    ctx.hocuspocus.closeConnections();
    for (const document of [...ctx.hocuspocus.documents.values()]) {
      await ctx.hocuspocus.unloadDocument(document);
    }

    const reloaded = connect(
      documentName,
      formatJwtCollabToken(ada.accessToken),
    );
    await waitUntilSynced(reloaded);
    await waitFor(() => shapes(reloaded.document).get("shape-1") === "sticky");
  });

  it("applies redeemed membership roles on the socket", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const grace = await registerUser(ctx.app, { email: "grace@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken);
    const viewerLink = await createShareLink(
      ctx.app,
      ada.accessToken,
      board.id,
      "viewer",
    );
    const documentName = documentNameForBoard(board.id);

    const redeemed = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: { authorization: `Bearer ${grace.accessToken}` },
      payload: { token: viewerLink.token },
    });
    expect(redeemed.statusCode).toBe(200);

    const owner = connect(documentName, formatJwtCollabToken(ada.accessToken));
    await waitUntilSynced(owner);
    shapes(owner.document).set("shape-1", "rect");

    const member = connect(
      documentName,
      formatJwtCollabToken(grace.accessToken),
    );
    await waitUntilSynced(member);
    expect(member.provider.authorizedScope).toBe("readonly");
    await waitFor(() => shapes(member.document).get("shape-1") === "rect");
    shapes(member.document).set("evil", "nope");
    await waitFor(() => member.provider.hasUnsyncedChanges);
    expect(shapes(owner.document).get("evil")).toBeUndefined();

    await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/whiteboards/${board.id}/share-links/${viewerLink.id}`,
      headers: { authorization: `Bearer ${ada.accessToken}` },
    });
    member.provider.destroy();

    const afterRevoke = connect(
      documentName,
      formatJwtCollabToken(grace.accessToken),
    );
    await waitFor(() => afterRevoke.authFailure !== null);
    expect(afterRevoke.authFailure).toEqual({ reason: "unauthorized" });
  });
});
