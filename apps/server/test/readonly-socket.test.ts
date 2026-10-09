import type { Connection } from "@hocuspocus/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CollabContext } from "../src/collaboration/auth.js";
import {
  documentNameForBoard,
  formatShareCollabToken,
} from "../src/collaboration/contract.js";
import {
  createBoard,
  createShareLink,
  createTestApp,
  listen,
  registerUser,
  waitFor,
  type TestContext,
} from "./helpers.js";
import { RawCollabSocket, updateForShape } from "./raw-socket.js";

describe("raw read-only websocket updates", () => {
  let ctx: TestContext;
  let wsUrl = "";

  beforeAll(async () => {
    ctx = await createTestApp();
    wsUrl = await listen(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

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

  it("drops a raw update from a viewer and still accepts an editor update", async () => {
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken, "Raw");
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
    const editor = await RawCollabSocket.connect(wsUrl);
    const viewer = await RawCollabSocket.connect(wsUrl);

    try {
      const editorScope = await editor.authenticate(
        documentName,
        formatShareCollabToken(editorLink.token),
      );
      expect(editorScope).toBe("read-write");

      const editorSaved = await editor.sendUpdate(
        documentName,
        updateForShape("shape-1", "rect"),
      );
      expect(editorSaved).toBe(true);
      await waitFor(async () => {
        const shapes = await serverShapes(documentName);
        return shapes["shape-1"] === "rect";
      });

      const viewerScope = await viewer.authenticate(
        documentName,
        formatShareCollabToken(viewerLink.token),
      );
      expect(viewerScope).toBe("readonly");

      const connections =
        ctx.hocuspocus.documents.get(documentName)?.getConnections() ?? [];
      const viewerConnection = connections.find((connection: Connection) => {
        return (connection.context as CollabContext).role === "viewer";
      });
      expect(viewerConnection?.readOnly).toBe(true);

      const viewerSaved = await viewer.sendUpdate(
        documentName,
        updateForShape("evil", "injected"),
      );
      expect(viewerSaved).toBe(false);

      const afterViewer = await serverShapes(documentName);
      expect(afterViewer).toMatchObject({ "shape-1": "rect" });
      expect(afterViewer).not.toHaveProperty("evil");

      const followUpSaved = await editor.sendUpdate(
        documentName,
        updateForShape("shape-2", "ellipse"),
      );
      expect(followUpSaved).toBe(true);
      await waitFor(async () => {
        const shapes = await serverShapes(documentName);
        return shapes["shape-2"] === "ellipse" && shapes["evil"] === undefined;
      });
    } finally {
      editor.close();
      viewer.close();
    }
  });
});
