import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { ShapeStore } from "../src/sync/shapeStore";
import type { NewShape } from "../src/sync/types";

function rect(x = 0): NewShape {
  return {
    type: "rect",
    geometry: { x, y: 0, width: 40, height: 20 },
    style: { stroke: "#111111", strokeWidth: 2, fill: "transparent" },
  };
}

function mirror(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

function diverge(a: Y.Doc, b: Y.Doc, mutate: () => void): void {
  const baseA = Y.encodeStateVector(a);
  const baseB = Y.encodeStateVector(b);
  mutate();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, baseB));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, baseA));
}

describe("ShapeStore", () => {
  it("stores shapes in a Y.Map keyed by id, not a Y.Array", () => {
    const store = new ShapeStore(new Y.Doc());
    const id = store.add(rect());
    const shape = store.shapes.get(id);
    expect(store.shapes).toBeInstanceOf(Y.Map);
    expect(store.shapes).not.toBeInstanceOf(Y.Array);
    expect(shape).toBeInstanceOf(Y.Map);
    expect(shape?.get("geometry")).toBeInstanceOf(Y.Map);
    expect(shape?.get("style")).toBeInstanceOf(Y.Map);
    expect(typeof shape?.get("zIndex")).toBe("string");
    expect(shape?.get("type")).toBe("rect");
  });

  it("adds, updates, and deletes a shape", () => {
    const store = new ShapeStore(new Y.Doc());
    const id = store.add(rect(4));
    store.updateGeometry(id, { x: 12, width: 8 });
    store.updateStyle(id, { stroke: "#ff0000" });
    const shape = store.get(id);
    expect(shape?.type).toBe("rect");
    expect(shape?.geometry).toMatchObject({
      x: 12,
      y: 0,
      width: 8,
      height: 20,
    });
    expect(shape?.style).toMatchObject({
      stroke: "#ff0000",
      strokeWidth: 2,
      fill: "transparent",
    });
    store.delete(id);
    expect(store.get(id)).toBeNull();
    expect(store.list()).toEqual([]);
    store.delete(id);
  });

  it("keeps pen points in a Y.Array and can move them", () => {
    const store = new ShapeStore(new Y.Doc());
    const id = store.add({
      type: "pen",
      geometry: { points: [1, 2] },
    });
    const geometry = store.shapes.get(id)?.get("geometry");
    expect(geometry).toBeInstanceOf(Y.Map);
    expect((geometry as Y.Map<unknown>).get("points")).toBeInstanceOf(Y.Array);
    store.appendPenPoints(id, [3, 4]);
    store.moveBy(id, 10, -2);
    expect(store.get(id)?.geometry).toEqual({ points: [11, 0, 13, 2] });
  });

  it("adds a sticky note and reorders with fractional indexes", () => {
    const store = new ShapeStore(new Y.Doc());
    const back = store.add(rect());
    const mid = store.add({
      type: "sticky",
      geometry: { x: 1, y: 2, width: 80, height: 60, text: "Note" },
    });
    const front = store.add(rect(8));
    expect(store.list().map((shape) => shape.id)).toEqual([back, mid, front]);
    const before = store.get(mid);
    store.bringForward(back);
    expect(store.list().map((shape) => shape.id)).toEqual([mid, back, front]);
    store.sendBackward(front);
    expect(store.list().map((shape) => shape.id)).toEqual([mid, front, back]);
    expect(store.get(mid)?.geometry).toEqual(before?.geometry);
    const top = store.list().at(-1);
    if (!top) throw new Error("missing shape");
    const zBefore = top.zIndex;
    store.bringForward(top.id);
    expect(store.get(top.id)?.zIndex).toBe(zBefore);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const store = new ShapeStore(new Y.Doc());
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    store.add(rect());
    expect(calls).toBeGreaterThan(0);
    const frozen = calls;
    stop();
    store.add(rect());
    expect(calls).toBe(frozen);
  });

  it("merges concurrent adds, field edits, deletes, and reorders", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new ShapeStore(docA);
    const b = new ShapeStore(docB);
    const keep = a.add(rect());
    const left = a.add(rect(20));
    const right = a.add(rect(40));
    mirror(docA, docB);

    diverge(docA, docB, () => {
      a.add({
        type: "ellipse",
        geometry: { x: 1, y: 1, radiusX: 4, radiusY: 5 },
      });
      b.add({
        type: "sticky",
        geometry: { x: 3, y: 3, width: 30, height: 30, text: "Hi" },
      });
    });
    expect(a.list()).toEqual(b.list());
    expect(a.list()).toHaveLength(5);

    diverge(docA, docB, () => {
      a.updateGeometry(keep, { x: 99 });
      b.updateStyle(keep, { strokeWidth: 8 });
    });
    expect(a.get(keep)?.geometry).toMatchObject({ x: 99 });
    expect(a.get(keep)?.style.strokeWidth).toBe(8);
    expect(a.list()).toEqual(b.list());

    diverge(docA, docB, () => {
      a.delete(left);
      b.bringForward(right);
    });
    expect(a.get(left)).toBeNull();
    expect(a.get(keep)).not.toBeNull();
    expect(a.get(right)).not.toBeNull();
    expect(a.list()).toEqual(b.list());

    diverge(docA, docB, () => {
      a.updateStyle(keep, { stroke: "#111111" });
      b.updateStyle(keep, { stroke: "#eeeeee" });
    });
    expect(a.get(keep)?.style.stroke).toBe(b.get(keep)?.style.stroke);
    expect(
      a
        .list()
        .map((shape) => shape.id)
        .sort(),
    ).toEqual(
      b
        .list()
        .map((shape) => shape.id)
        .sort(),
    );
  });

  it("merges concurrent pen appends on one shape", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new ShapeStore(docA);
    const id = a.add({ type: "pen", geometry: { points: [0, 0] } });
    mirror(docA, docB);
    const b = new ShapeStore(docB);
    diverge(docA, docB, () => {
      a.appendPenPoints(id, [3, 4]);
      b.appendPenPoints(id, [5, 6]);
    });
    const points = a.get(id);
    expect(points?.type).toBe("pen");
    if (points?.type !== "pen") return;
    expect(points.geometry.points).toHaveLength(6);
    expect(a.list()).toEqual(b.list());
  });
});
