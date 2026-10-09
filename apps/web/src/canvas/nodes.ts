import Konva from "konva";
import { DEFAULT_STICKY_FILL } from "../theme/palette";
import type { ShapeSnapshot } from "../sync/types";

const FONT = "Outfit, sans-serif";

export function visibleFill(fill: string): string {
  return fill === "transparent" ? "rgba(0,0,0,0.004)" : fill;
}

export function createShapeNode(shape: ShapeSnapshot): Konva.Node {
  const node = buildNode(shape);
  node.setAttr("shapeType", shape.type);
  node.setAttr("sig", "");
  return node;
}

export function updateShapeNode(
  node: Konva.Node,
  shape: ShapeSnapshot,
): boolean {
  if (node.getAttr("shapeType") !== shape.type) return false;
  applySnapshot(node, shape);
  return true;
}

function buildNode(shape: ShapeSnapshot): Konva.Node {
  switch (shape.type) {
    case "rect":
      return new Konva.Rect(rectAttrs(shape));
    case "ellipse":
      return new Konva.Ellipse(ellipseAttrs(shape));
    case "line":
      return new Konva.Line(lineAttrs(shape));
    case "arrow":
      return new Konva.Arrow(arrowAttrs(shape));
    case "pen":
      return new Konva.Line(penAttrs(shape));
    case "text":
      return new Konva.Text(textAttrs(shape));
    case "sticky":
      return stickyGroup(shape);
  }
}

function applySnapshot(node: Konva.Node, shape: ShapeSnapshot): void {
  switch (shape.type) {
    case "rect":
      node.setAttrs(rectAttrs(shape));
      break;
    case "ellipse":
      node.setAttrs(ellipseAttrs(shape));
      break;
    case "line":
      node.setAttrs(lineAttrs(shape));
      break;
    case "arrow":
      node.setAttrs(arrowAttrs(shape));
      break;
    case "pen":
      node.setAttrs(penAttrs(shape));
      break;
    case "text":
      node.setAttrs(textAttrs(shape));
      break;
    case "sticky":
      if (node instanceof Konva.Group) applySticky(node, shape);
      break;
  }
  node.scale({ x: 1, y: 1 });
}

function shared(shape: ShapeSnapshot) {
  return {
    id: shape.id,
    name: "shape",
    draggable: false,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    strokeScaleEnabled: false,
    stroke: shape.style.stroke,
    strokeWidth: shape.style.strokeWidth,
    hitStrokeWidth: Math.max(shape.style.strokeWidth, 14),
  };
}

function rectAttrs(shape: Extract<ShapeSnapshot, { type: "rect" }>) {
  return {
    ...shared(shape),
    x: shape.geometry.x,
    y: shape.geometry.y,
    width: Math.max(shape.geometry.width, 1),
    height: Math.max(shape.geometry.height, 1),
    fill: visibleFill(shape.style.fill),
  };
}

function ellipseAttrs(shape: Extract<ShapeSnapshot, { type: "ellipse" }>) {
  return {
    ...shared(shape),
    x: shape.geometry.x,
    y: shape.geometry.y,
    radiusX: Math.max(shape.geometry.radiusX, 1),
    radiusY: Math.max(shape.geometry.radiusY, 1),
    fill: visibleFill(shape.style.fill),
  };
}

function lineAttrs(shape: Extract<ShapeSnapshot, { type: "line" }>) {
  return {
    ...shared(shape),
    x: 0,
    y: 0,
    points: [
      shape.geometry.x1,
      shape.geometry.y1,
      shape.geometry.x2,
      shape.geometry.y2,
    ],
    lineCap: "round" as const,
    lineJoin: "round" as const,
  };
}

function arrowAttrs(shape: Extract<ShapeSnapshot, { type: "arrow" }>) {
  return {
    ...lineAttrs({ ...shape, type: "line" }),
    id: shape.id,
    fill: shape.style.stroke,
    pointerLength: 14,
    pointerWidth: 14,
  };
}

function penAttrs(shape: Extract<ShapeSnapshot, { type: "pen" }>) {
  return {
    ...shared(shape),
    x: 0,
    y: 0,
    points: shape.geometry.points,
    tension: 0.35,
    lineCap: "round" as const,
    lineJoin: "round" as const,
  };
}

function textAttrs(shape: Extract<ShapeSnapshot, { type: "text" }>) {
  return {
    ...shared(shape),
    x: shape.geometry.x,
    y: shape.geometry.y,
    text: shape.geometry.text,
    fontSize: shape.geometry.fontSize,
    fontFamily: FONT,
    width: Math.max(shape.geometry.width, 24),
    fill: shape.style.stroke,
    name: "shape",
  };
}

function stickyGroup(
  shape: Extract<ShapeSnapshot, { type: "sticky" }>,
): Konva.Group {
  const group = new Konva.Group({
    id: shape.id,
    name: "shape",
    x: shape.geometry.x,
    y: shape.geometry.y,
    draggable: false,
  });
  group.setAttr("shapeType", shape.type);
  const background = new Konva.Rect({
    name: "sticky-bg",
    width: shape.geometry.width,
    height: shape.geometry.height,
    fill: stickyFill(shape.style.fill),
    stroke: shape.style.stroke,
    strokeWidth: shape.style.strokeWidth,
    cornerRadius: 6,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
  });
  const text = new Konva.Text({
    name: "sticky-text",
    x: 12,
    y: 12,
    width: Math.max(shape.geometry.width - 24, 16),
    text: shape.geometry.text,
    fontSize: 16,
    fontFamily: FONT,
    fill: "#3f2d16",
    lineHeight: 1.3,
  });
  group.add(background, text);
  return group;
}

function applySticky(
  node: Konva.Group,
  shape: Extract<ShapeSnapshot, { type: "sticky" }>,
): void {
  node.setAttrs({
    id: shape.id,
    name: "shape",
    x: shape.geometry.x,
    y: shape.geometry.y,
  });
  const background = node.findOne(".sticky-bg");
  const text = node.findOne(".sticky-text");
  background?.setAttrs({
    width: shape.geometry.width,
    height: shape.geometry.height,
    fill: stickyFill(shape.style.fill),
    stroke: shape.style.stroke,
    strokeWidth: shape.style.strokeWidth,
  });
  text?.setAttrs({
    width: Math.max(shape.geometry.width - 24, 16),
    text: shape.geometry.text,
  });
}

function stickyFill(fill: string): string {
  return fill === "transparent" ? DEFAULT_STICKY_FILL : fill;
}

export function shapeSignature(shape: ShapeSnapshot): string {
  return `${shape.type}|${shape.zIndex}|${shape.style.stroke}|${shape.style.strokeWidth}|${shape.style.fill}|${JSON.stringify(shape.geometry)}`;
}
