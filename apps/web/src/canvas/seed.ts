import type { RectGeometry, ShapeStyle } from "../sync/types";
import { ShapeStore } from "../sync/shapeStore";

const PITCH = 44;
const COLUMNS = 50;

const PERF_STYLES: ShapeStyle[] = [
  { stroke: "#0f6e62", strokeWidth: 2, fill: "#d7f3ec" },
  { stroke: "#c4552a", strokeWidth: 2, fill: "#ffe0d6" },
  { stroke: "#1d4ed8", strokeWidth: 2, fill: "#dbe7ff" },
  { stroke: "#a16207", strokeWidth: 2, fill: "#fff4cc" },
  { stroke: "#7c3aed", strokeWidth: 2, fill: "#f3e8ff" },
];

export function perfShapeGeometry(index: number): RectGeometry {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return {
    x: 24 + column * PITCH,
    y: 24 + row * PITCH,
    width: 36,
    height: 28,
  };
}

/** Adds simple rectangles for the dev pan benchmark. Returns how many were added. */
export function addPerfShapes(store: ShapeStore, count: number): number {
  if (count <= 0) return 0;
  const start = store.list().length;
  store.doc.transact(() => {
    for (let offset = 0; offset < count; offset += 1) {
      const index = start + offset;
      store.add({
        type: "rect",
        geometry: perfShapeGeometry(index),
        style: PERF_STYLES[index % PERF_STYLES.length],
      });
    }
  });
  return count;
}

export function ensureShapeCount(store: ShapeStore, count: number): number {
  return addPerfShapes(store, count - store.list().length);
}
