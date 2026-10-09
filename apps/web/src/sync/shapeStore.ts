import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import {
  DEFAULT_STYLE,
  LOCAL_ORIGIN,
  SHAPES_KEY,
  isShapeType,
  type LineGeometry,
  type NewShape,
  type PenGeometry,
  type ShapeGeometry,
  type ShapeSnapshot,
  type ShapeStyle,
  type ShapeType,
} from "./types";

/**
 * Shapes live in a Y.Map keyed by id, never a Y.Array, so concurrent deletes
 * commute. Each value is a Y.Map with `type`, nested `geometry`, nested
 * `style`, and a fractional-index `zIndex` string.
 *
 * Pen points are a Y.Array inside geometry so concurrent appends merge.
 * P1 undo: `new Y.UndoManager(store.shapes, { trackedOrigins: new Set([LOCAL_ORIGIN]) })`.
 */
export class ShapeStore {
  readonly shapes: Y.Map<Y.Map<unknown>>;

  constructor(
    readonly doc: Y.Doc,
    mapName = SHAPES_KEY,
  ) {
    this.shapes = doc.getMap(mapName);
  }

  add(input: NewShape): string {
    const id = crypto.randomUUID();
    this.change(() => {
      const shape = new Y.Map<unknown>();
      shape.set("id", id);
      shape.set("type", input.type);
      shape.set("zIndex", input.zIndex ?? this.frontKey());
      shape.set("geometry", this.createGeometry(input));
      shape.set("style", this.createStyle(input.style));
      this.shapes.set(id, shape);
    });
    return id;
  }

  updateGeometry(id: string, patch: Record<string, number | string>): void {
    const geometry = this.geometryMap(id);
    if (!geometry) return;
    this.change(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (key === "points") continue;
        geometry.set(key, value);
      }
    });
  }

  updateStyle(id: string, patch: Partial<ShapeStyle>): void {
    const style = this.styleMap(id);
    if (!style) return;
    this.change(() => {
      if (patch.stroke !== undefined) style.set("stroke", patch.stroke);
      if (patch.strokeWidth !== undefined) {
        style.set("strokeWidth", patch.strokeWidth);
      }
      if (patch.fill !== undefined) style.set("fill", patch.fill);
    });
  }

  setPenPoints(id: string, points: number[]): void {
    const geometry = this.geometryMap(id);
    if (!geometry) return;
    this.change(() => {
      replacePoints(geometry, points);
    });
  }

  appendPenPoints(id: string, points: number[]): void {
    if (points.length === 0) return;
    const geometry = this.geometryMap(id);
    if (!geometry) return;
    const existing = geometry.get("points");
    if (!(existing instanceof Y.Array)) return;
    this.change(() => {
      existing.push(points);
    });
  }

  moveBy(id: string, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const shape = this.get(id);
    const geometry = this.geometryMap(id);
    if (!shape || !geometry) return;
    this.change(() => {
      if (shape.type === "pen") {
        const moved = shape.geometry.points.map(
          (value, index) => value + (index % 2 === 0 ? dx : dy),
        );
        replacePoints(geometry, moved);
        return;
      }
      if (shape.type === "line" || shape.type === "arrow") {
        geometry.set("x1", shape.geometry.x1 + dx);
        geometry.set("y1", shape.geometry.y1 + dy);
        geometry.set("x2", shape.geometry.x2 + dx);
        geometry.set("y2", shape.geometry.y2 + dy);
        return;
      }
      geometry.set("x", shape.geometry.x + dx);
      geometry.set("y", shape.geometry.y + dy);
    });
  }

  delete(id: string): void {
    if (!this.shapes.has(id)) return;
    this.change(() => {
      this.shapes.delete(id);
    });
  }

  bringForward(id: string): void {
    const ordered = this.list();
    const index = ordered.findIndex((shape) => shape.id === id);
    if (index < 0 || index === ordered.length - 1) return;
    const lower = ordered[index + 1]?.zIndex ?? null;
    const upper = ordered[index + 2]?.zIndex ?? null;
    this.setZIndex(id, between(lower, upper));
  }

  sendBackward(id: string): void {
    const ordered = this.list();
    const index = ordered.findIndex((shape) => shape.id === id);
    if (index <= 0) return;
    const lower = index >= 2 ? (ordered[index - 2]?.zIndex ?? null) : null;
    const upper = ordered[index - 1]?.zIndex ?? null;
    this.setZIndex(id, between(lower, upper));
  }

  get(id: string): ShapeSnapshot | null {
    const shape = this.shapes.get(id);
    if (!shape) return null;
    return readShape(id, shape);
  }

  list(): ShapeSnapshot[] {
    const snapshots: ShapeSnapshot[] = [];
    this.shapes.forEach((shape, id) => {
      const snapshot = readShape(id, shape);
      if (snapshot) snapshots.push(snapshot);
    });
    snapshots.sort(compareShapes);
    return snapshots;
  }

  subscribe(listener: () => void): () => void {
    const handler = () => {
      listener();
    };
    this.shapes.observeDeep(handler);
    return () => {
      this.shapes.unobserveDeep(handler);
    };
  }

  private setZIndex(id: string, zIndex: string): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    this.change(() => {
      shape.set("zIndex", zIndex);
    });
  }

  private frontKey(): string {
    let max: string | null = null;
    this.shapes.forEach((shape) => {
      const zIndex = shape.get("zIndex");
      if (typeof zIndex !== "string") return;
      if (max === null || zIndex > max) max = zIndex;
    });
    return generateKeyBetween(max, null);
  }

  private change(fn: () => void): void {
    this.doc.transact(fn, LOCAL_ORIGIN);
  }

  private geometryMap(id: string): Y.Map<unknown> | null {
    return childMap(this.shapes.get(id), "geometry");
  }

  private styleMap(id: string): Y.Map<unknown> | null {
    return childMap(this.shapes.get(id), "style");
  }

  private createGeometry(input: NewShape): Y.Map<unknown> {
    const geometry = new Y.Map<unknown>();
    if (input.type === "pen") {
      const points = new Y.Array<number>();
      if (input.geometry.points.length > 0) points.push(input.geometry.points);
      geometry.set("points", points);
      return geometry;
    }
    for (const [key, value] of Object.entries(input.geometry)) {
      geometry.set(key, value);
    }
    return geometry;
  }

  private createStyle(partial?: Partial<ShapeStyle>): Y.Map<string | number> {
    const style = new Y.Map<string | number>();
    const resolved = { ...DEFAULT_STYLE, ...partial };
    style.set("stroke", resolved.stroke);
    style.set("strokeWidth", resolved.strokeWidth);
    style.set("fill", resolved.fill);
    return style;
  }
}

function childMap(
  shape: Y.Map<unknown> | undefined,
  key: "geometry" | "style",
): Y.Map<unknown> | null {
  if (!shape) return null;
  const child = shape.get(key);
  return child instanceof Y.Map ? child : null;
}

function replacePoints(geometry: Y.Map<unknown>, points: number[]): void {
  const existing = geometry.get("points");
  if (existing instanceof Y.Array) {
    if (existing.length > 0) existing.delete(0, existing.length);
    if (points.length > 0) existing.push(points);
    return;
  }
  const created = new Y.Array<number>();
  if (points.length > 0) created.push(points);
  geometry.set("points", created);
}

function between(lower: string | null, upper: string | null): string {
  if (lower !== null && upper !== null && lower === upper) {
    return generateKeyBetween(lower, null);
  }
  return generateKeyBetween(lower, upper);
}

function compareShapes(a: ShapeSnapshot, b: ShapeSnapshot): number {
  if (a.zIndex < b.zIndex) return -1;
  if (a.zIndex > b.zIndex) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function readShape(id: string, shape: Y.Map<unknown>): ShapeSnapshot | null {
  const type = shape.get("type");
  const zIndex = shape.get("zIndex");
  const geometry = shape.get("geometry");
  const style = shape.get("style");
  if (!isShapeType(type) || typeof zIndex !== "string") return null;
  if (!(geometry instanceof Y.Map) || !(style instanceof Y.Map)) return null;
  const parsed = readGeometry(type, geometry);
  if (!parsed) return null;
  return {
    id,
    type,
    zIndex,
    geometry: parsed,
    style: readStyle(style),
  } as ShapeSnapshot;
}

function readStyle(style: Y.Map<unknown>): ShapeStyle {
  return {
    stroke: str(style.get("stroke"), DEFAULT_STYLE.stroke),
    strokeWidth: num(style.get("strokeWidth"), DEFAULT_STYLE.strokeWidth),
    fill: str(style.get("fill"), DEFAULT_STYLE.fill),
  };
}

function readGeometry(
  type: ShapeType,
  geometry: Y.Map<unknown>,
): ShapeGeometry | null {
  if (type === "rect" || type === "sticky") {
    const base = {
      x: num(geometry.get("x")),
      y: num(geometry.get("y")),
      width: num(geometry.get("width")),
      height: num(geometry.get("height")),
    };
    if (type === "sticky") return { ...base, text: str(geometry.get("text")) };
    return base;
  }
  if (type === "ellipse") {
    return {
      x: num(geometry.get("x")),
      y: num(geometry.get("y")),
      radiusX: num(geometry.get("radiusX")),
      radiusY: num(geometry.get("radiusY")),
    };
  }
  if (type === "line" || type === "arrow") {
    return {
      x1: num(geometry.get("x1")),
      y1: num(geometry.get("y1")),
      x2: num(geometry.get("x2")),
      y2: num(geometry.get("y2")),
    };
  }
  if (type === "pen") {
    const points = geometry.get("points");
    return {
      points: points instanceof Y.Array ? numbers(points.toArray()) : [],
    };
  }
  return {
    x: num(geometry.get("x")),
    y: num(geometry.get("y")),
    text: str(geometry.get("text"), "Text"),
    fontSize: num(geometry.get("fontSize"), 22),
    width: num(geometry.get("width"), 240),
  };
}

function numbers(values: readonly unknown[]): number[] {
  return values.map((value) => num(value));
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function linePoints(geometry: LineGeometry): number[] {
  return [geometry.x1, geometry.y1, geometry.x2, geometry.y2];
}

export function penGeometry(points: number[]): PenGeometry {
  return { points };
}
