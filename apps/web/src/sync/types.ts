export const SHAPES_KEY = "shapes";

/** Transaction origin for local edits. P1 undo can track only this origin. */
export const LOCAL_ORIGIN = "whiteboard-local";

export const SHAPE_TYPES = [
  "pen",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "text",
  "sticky",
] as const;

export type ShapeType = (typeof SHAPE_TYPES)[number];

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
}

export interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseGeometry {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

export interface LineGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PenGeometry {
  points: number[];
}

export interface TextGeometry {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  width: number;
}

export interface StickyGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface ShapeBase {
  id: string;
  zIndex: string;
  style: ShapeStyle;
}

export type ShapeSnapshot =
  | (ShapeBase & { type: "rect"; geometry: RectGeometry })
  | (ShapeBase & { type: "ellipse"; geometry: EllipseGeometry })
  | (ShapeBase & { type: "line"; geometry: LineGeometry })
  | (ShapeBase & { type: "arrow"; geometry: LineGeometry })
  | (ShapeBase & { type: "pen"; geometry: PenGeometry })
  | (ShapeBase & { type: "text"; geometry: TextGeometry })
  | (ShapeBase & { type: "sticky"; geometry: StickyGeometry });

export type ShapeGeometry = ShapeSnapshot["geometry"];

export type NewShape = {
  [Type in ShapeType]: {
    type: Type;
    geometry: Extract<ShapeSnapshot, { type: Type }>["geometry"];
    style?: Partial<ShapeStyle>;
    zIndex?: string;
  };
}[ShapeType];

export const DEFAULT_STYLE: ShapeStyle = {
  stroke: "#241c16",
  strokeWidth: 3,
  fill: "transparent",
};

export function isShapeType(value: unknown): value is ShapeType {
  return (
    typeof value === "string" &&
    (SHAPE_TYPES as readonly string[]).includes(value)
  );
}
