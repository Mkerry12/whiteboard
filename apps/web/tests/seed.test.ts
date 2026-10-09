import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addPerfShapes, ensureShapeCount } from "../src/canvas/seed";
import { ShapeStore } from "../src/sync/shapeStore";

describe("perf seed", () => {
  it("tops up until the requested count", () => {
    const store = new ShapeStore(new Y.Doc());
    expect(addPerfShapes(store, 2)).toBe(2);
    expect(ensureShapeCount(store, 5)).toBe(3);
    expect(store.list()).toHaveLength(5);
    expect(ensureShapeCount(store, 5)).toBe(0);
    expect(store.list().every((shape) => shape.type === "rect")).toBe(true);
  });
});
