export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export interface Point {
  x: number;
  y: number;
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function screenToWorld(pointer: Point, camera: Camera): Point {
  return {
    x: (pointer.x - camera.x) / camera.scale,
    y: (pointer.y - camera.y) / camera.scale,
  };
}

export function worldToScreen(point: Point, camera: Camera): Point {
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}

export function zoomAt(input: {
  pointer: Point;
  camera: Camera;
  nextScale: number;
  min?: number;
  max?: number;
}): Camera {
  const scale = clamp(
    input.nextScale,
    input.min ?? MIN_ZOOM,
    input.max ?? MAX_ZOOM,
  );
  const world = screenToWorld(input.pointer, input.camera);
  return {
    scale,
    x: input.pointer.x - world.x * scale,
    y: input.pointer.y - world.y * scale,
  };
}

export function normalizeBox(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function ellipseFromCorners(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const box = normalizeBox(x1, y1, x2, y2);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    radiusX: box.width / 2,
    radiusY: box.height / 2,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function scalePoints(
  points: readonly number[],
  origin: Point,
  scaleX: number,
  scaleY: number,
): number[] {
  const next: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const x = points[index] ?? 0;
    const y = points[index + 1] ?? 0;
    next.push(origin.x + x * scaleX, origin.y + y * scaleY);
  }
  return next;
}
