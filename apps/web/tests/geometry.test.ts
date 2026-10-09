import { describe, expect, it } from "vitest";
import {
  ellipseFromCorners,
  normalizeBox,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "../src/canvas/geometry";
import { perfShapeGeometry } from "../src/canvas/seed";
import { geometryAfterTransform } from "../src/canvas/transform";
import { showEditingTools } from "../src/canvas/tools";
import type { ShapeSnapshot } from "../src/sync/types";

const style = { stroke: "#111111", strokeWidth: 2, fill: "#ffffff" };

describe("canvas geometry", () => {
  it("round-trips screen and world coordinates", () => {
    const camera = { x: 20, y: -10, scale: 2 };
    const world = { x: 15, y: 8 };
    expect(screenToWorld(worldToScreen(world, camera), camera)).toEqual(world);
  });

  it("zooms toward the pointer", () => {
    const next = zoomAt({
      pointer: { x: 100, y: 50 },
      camera: { x: 0, y: 0, scale: 1 },
      nextScale: 2,
    });
    expect(next.scale).toBe(2);
    expect(screenToWorld({ x: 100, y: 50 }, next)).toEqual({ x: 100, y: 50 });
  });

  it("normalizes dragged boxes and ellipses", () => {
    expect(normalizeBox(10, 10, 2, 4)).toEqual({
      x: 2,
      y: 4,
      width: 8,
      height: 6,
    });
    expect(ellipseFromCorners(0, 0, 10, 4)).toEqual({
      x: 5,
      y: 2,
      radiusX: 5,
      radiusY: 2,
    });
  });

  it("bakes resize transforms for rect, sticky, text, and line", () => {
    const rect: ShapeSnapshot = {
      id: "r",
      type: "rect",
      zIndex: "a0",
      style,
      geometry: { x: 10, y: 12, width: 20, height: 30 },
    };
    expect(
      geometryAfterTransform(rect, { x: 14, y: 16, scaleX: 2, scaleY: 0.5 }),
    ).toEqual({ x: 14, y: 16, width: 40, height: 15 });

    const sticky: ShapeSnapshot = {
      id: "s",
      type: "sticky",
      zIndex: "a1",
      style,
      geometry: { x: 0, y: 0, width: 100, height: 80, text: "Note" },
    };
    expect(
      geometryAfterTransform(sticky, { x: 5, y: 6, scaleX: 1.5, scaleY: 1 }),
    ).toMatchObject({ x: 5, y: 6, width: 150, height: 80, text: "Note" });

    const text: ShapeSnapshot = {
      id: "t",
      type: "text",
      zIndex: "a2",
      style,
      geometry: { x: 0, y: 0, text: "Hi", fontSize: 20, width: 100 },
    };
    expect(
      geometryAfterTransform(text, { x: 1, y: 2, scaleX: 2, scaleY: 1.5 }),
    ).toMatchObject({ fontSize: 30, width: 200, text: "Hi" });

    const line: ShapeSnapshot = {
      id: "l",
      type: "line",
      zIndex: "a3",
      style,
      geometry: { x1: 0, y1: 0, x2: 10, y2: 4 },
    };
    expect(
      geometryAfterTransform(line, { x: 3, y: 1, scaleX: 2, scaleY: 2 }),
    ).toEqual({ x1: 3, y1: 1, x2: 23, y2: 9 });
  });

  it("spaces perf rectangles on a grid", () => {
    expect(perfShapeGeometry(0).x).toBeLessThan(perfShapeGeometry(1).x);
    expect(perfShapeGeometry(50).y).toBeGreaterThan(perfShapeGeometry(0).y);
  });

  it("hides editing tools while read-only", () => {
    expect(showEditingTools(true)).toBe(false);
    expect(showEditingTools(false)).toBe(true);
  });
});
