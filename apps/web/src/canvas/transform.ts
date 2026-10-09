import { scalePoints } from "./geometry";
import type { ShapeGeometry, ShapeSnapshot } from "../sync/types";

export interface NodeTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

const MIN_SIZE = 8;

export function geometryAfterTransform(
  shape: ShapeSnapshot,
  transform: NodeTransform,
): ShapeGeometry {
  const scaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
  const scaleY = transform.scaleY === 0 ? 1 : transform.scaleY;
  if (shape.type === "rect" || shape.type === "sticky") {
    return {
      ...shape.geometry,
      x: transform.x,
      y: transform.y,
      width: Math.max(MIN_SIZE, shape.geometry.width * Math.abs(scaleX)),
      height: Math.max(MIN_SIZE, shape.geometry.height * Math.abs(scaleY)),
    };
  }
  if (shape.type === "ellipse") {
    return {
      x: transform.x,
      y: transform.y,
      radiusX: Math.max(
        MIN_SIZE / 2,
        shape.geometry.radiusX * Math.abs(scaleX),
      ),
      radiusY: Math.max(
        MIN_SIZE / 2,
        shape.geometry.radiusY * Math.abs(scaleY),
      ),
    };
  }
  if (shape.type === "text") {
    return {
      ...shape.geometry,
      x: transform.x,
      y: transform.y,
      width: Math.max(24, shape.geometry.width * Math.abs(scaleX)),
      fontSize: Math.max(8, shape.geometry.fontSize * Math.abs(scaleY)),
    };
  }
  if (shape.type === "pen") {
    return {
      points: scalePoints(
        shape.geometry.points,
        { x: transform.x, y: transform.y },
        scaleX,
        scaleY,
      ),
    };
  }
  const points = scalePoints(
    [
      shape.geometry.x1,
      shape.geometry.y1,
      shape.geometry.x2,
      shape.geometry.y2,
    ],
    { x: transform.x, y: transform.y },
    scaleX,
    scaleY,
  );
  return {
    x1: points[0] ?? 0,
    y1: points[1] ?? 0,
    x2: points[2] ?? 0,
    y2: points[3] ?? 0,
  };
}
