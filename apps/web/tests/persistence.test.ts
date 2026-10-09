import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { loadDocument, storeDocument } from "../dev/persistence";
import { ShapeStore } from "../src/sync/shapeStore";

describe("sync server persistence", () => {
  it("restores shapes from the document file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "whiteboard-"));
    const original = new Y.Doc();
    const store = new ShapeStore(original);
    store.add({
      type: "sticky",
      geometry: { x: 4, y: 5, width: 80, height: 60, text: "Keep me" },
    });
    await storeDocument(directory, "board 1", original);

    const restored = new Y.Doc();
    await loadDocument(directory, "board 1", restored);
    expect(new ShapeStore(restored).list()).toEqual(store.list());
    await loadDocument(directory, "missing", new Y.Doc());
  });

  it("does not write outside the data directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "whiteboard-"));
    const parent = path.dirname(directory);
    const before = new Set(await readdir(parent));
    await storeDocument(directory, "../outside", new Y.Doc());
    const after = await readdir(parent);
    expect(after.filter((name) => !before.has(name))).toEqual([]);
    const files = await readdir(directory);
    expect(files.some((name) => name.endsWith(".yjs"))).toBe(true);
  });
});
