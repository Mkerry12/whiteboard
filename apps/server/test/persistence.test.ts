import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  documentNameForBoard,
  formatJwtCollabToken,
} from "../src/collaboration/contract.js";
import { whiteboards } from "../src/db/schema.js";
import {
  createBoard,
  createTestApp,
  listen,
  openCollabProvider,
  registerUser,
  waitFor,
  type TestContext,
} from "./helpers.js";

function connect(url: string, documentName: string, token: string) {
  const document = new Y.Doc();
  const provider = openCollabProvider({
    url,
    name: documentName,
    document,
    token,
  });
  return { document, provider };
}

describe("restart persistence", () => {
  let ctx: TestContext | undefined;

  afterAll(async () => {
    await ctx?.close();
  });

  it("keeps the Yjs snapshot after the server is restarted", async () => {
    ctx = await createTestApp();
    const ada = await registerUser(ctx.app, { email: "ada@example.com" });
    const board = await createBoard(ctx.app, ada.accessToken, "Durable");
    const documentName = documentNameForBoard(board.id);
    const token = formatJwtCollabToken(ada.accessToken);
    const firstUrl = await listen(ctx.app);
    const first = connect(firstUrl, documentName, token);

    try {
      await waitFor(
        () => first.provider.synced && first.provider.isAuthenticated,
      );
      first.document.getMap("shapes").set("shape-1", "sticky");
      await waitFor(() => first.provider.hasUnsyncedChanges === false);
    } finally {
      first.provider.destroy();
      first.document.destroy();
    }

    await waitFor(async () => {
      const rows = await ctx!.db
        .select({ yjsState: whiteboards.yjsState })
        .from(whiteboards)
        .where(eq(whiteboards.id, board.id))
        .limit(1);
      return (rows[0]?.yjsState?.byteLength ?? 0) > 0;
    });

    const restartedUrl = await ctx.restart();
    const second = connect(restartedUrl, documentName, token);
    try {
      await waitFor(
        () => second.provider.synced && second.provider.isAuthenticated,
      );
      await waitFor(
        () => second.document.getMap("shapes").get("shape-1") === "sticky",
      );
      expect(second.document.getMap("shapes").get("shape-1")).toBe("sticky");
    } finally {
      second.provider.destroy();
      second.document.destroy();
    }
  });
});
