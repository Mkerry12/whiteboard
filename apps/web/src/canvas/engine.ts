import Konva from "konva";
import {
  distance,
  ellipseFromCorners,
  normalizeBox,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Point,
} from "./geometry";
import { createShapeNode, shapeSignature, updateShapeNode } from "./nodes";
import { geometryAfterTransform } from "./transform";
import { DEFAULT_STICKY_FILL } from "../theme/palette";
import type { RemoteCursor } from "../sync/peers";
import type { ShapeStore } from "../sync/shapeStore";
import type { ShapeSnapshot, ShapeStyle } from "../sync/types";
import type { Tool } from "./tools";

export interface EngineHost {
  store: ShapeStore;
  getShapes: () => ShapeSnapshot[];
  getTool: () => Tool;
  getStyle: () => ShapeStyle;
  getReadOnly: () => boolean;
  getSelectedId: () => string | null;
  onSelect: (id: string | null) => void;
  onCursor: (point: Point | null) => void;
  onEditText: (id: string) => void;
  onCamera: () => void;
  onPanFps: (fps: number) => void;
}

interface DrawGesture {
  kind: "draw";
  id: string;
  tool: Tool;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
}

interface PanGesture {
  kind: "pan";
  pointerX: number;
  pointerY: number;
  stageX: number;
  stageY: number;
}

export class CanvasEngine {
  private readonly stage: Konva.Stage;
  private readonly shapesLayer = new Konva.Layer({ listening: true });
  private readonly uiLayer = new Konva.Layer();
  private readonly cursorLayer = new Konva.Layer({ listening: false });
  private readonly transformer: Konva.Transformer;
  private readonly nodes = new Map<string, Konva.Node>();
  private readonly cursorNodes = new Map<number, Konva.Group>();
  private readonly resizeObserver: ResizeObserver;
  private gesture: DrawGesture | PanGesture | null = null;
  private activeId: string | null = null;
  private editingId: string | null = null;
  private space = false;
  private panning = false;
  private cached = false;
  private pendingPointer: Point | null = null;
  private panRaf = 0;
  private panFrames = 0;
  private panStartedAt = 0;
  private cursorRaf = 0;
  private cursorPoint: Point | null = null;
  private cursorClear = false;

  constructor(
    private readonly container: HTMLDivElement,
    private readonly host: EngineHost,
  ) {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    this.stage = new Konva.Stage({
      container,
      width,
      height,
    });
    this.transformer = new Konva.Transformer({
      rotateEnabled: false,
      flipEnabled: false,
      ignoreStroke: true,
      padding: 4,
      anchorSize: 8,
      borderStroke: "#0f6e62",
      anchorFill: "#fffaf3",
      anchorStroke: "#0f6e62",
      boundBoxFunc: (oldBox, newBox) => {
        if (newBox.width < 8 || newBox.height < 8) return oldBox;
        return newBox;
      },
    });
    this.uiLayer.add(this.transformer);
    this.stage.add(this.shapesLayer, this.uiLayer, this.cursorLayer);
    this.resizeObserver = new ResizeObserver(() => {
      this.stage.size({
        width: Math.max(this.container.clientWidth, 1),
        height: Math.max(this.container.clientHeight, 1),
      });
    });
    this.resizeObserver.observe(container);
    this.stage.on("mousedown touchstart", (event) => {
      this.onPointerDown(event);
    });
    this.stage.on("mousemove touchmove", () => {
      this.onPointerMove();
    });
    this.stage.on("mouseup touchend", () => {
      this.finishGesture();
    });
    this.stage.on("mouseleave", () => {
      this.emitCursor(null);
    });
    this.stage.on("dblclick dbltap", (event) => {
      this.onDoubleClick(event);
    });
    this.stage.on("wheel", (event) => {
      this.onWheel(event);
    });
    this.stage.on("contextmenu", (event) => {
      event.evt.preventDefault();
    });
    this.applyMode();
    this.syncGrid();
  }

  destroy(): void {
    cancelAnimationFrame(this.panRaf);
    cancelAnimationFrame(this.cursorRaf);
    this.resizeObserver.disconnect();
    this.stage.destroy();
  }

  sync(shapes: readonly ShapeSnapshot[]): void {
    const seen = new Set<string>();
    const bulk = shapes.length > 300 && this.nodes.size === 0;
    shapes.forEach((shape, index) => {
      seen.add(shape.id);
      let node = this.nodes.get(shape.id);
      if (!node || node.getAttr("shapeType") !== shape.type) {
        node?.destroy();
        node = createShapeNode(shape);
        this.bindNode(node);
        this.shapesLayer.add(node as Konva.Shape | Konva.Group);
        this.nodes.set(shape.id, node);
        node.setAttr("sig", shapeSignature(shape));
      } else if (shape.id !== this.activeId) {
        const signature = shapeSignature(shape);
        if (node.getAttr("sig") !== signature) {
          updateShapeNode(node, shape);
          node.setAttr("sig", signature);
        }
      }
      if (!bulk && node.getZIndex() !== index) node.zIndex(index);
      node.draggable(this.canDrag());
      this.applyTextOpacity(node, shape.id);
    });
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      if (this.host.getSelectedId() === id) this.host.onSelect(null);
      node.destroy();
      this.nodes.delete(id);
    }
    this.refreshTransformer();
    this.shapesLayer.batchDraw();
    this.uiLayer.batchDraw();
  }

  syncCursors(cursors: readonly RemoteCursor[]): void {
    const seen = new Set<number>();
    const scale = this.stage.scaleX() || 1;
    for (const cursor of cursors) {
      seen.add(cursor.clientId);
      let group = this.cursorNodes.get(cursor.clientId);
      if (!group) {
        group = createCursor(cursor);
        this.cursorLayer.add(group);
        this.cursorNodes.set(cursor.clientId, group);
      }
      group.position({ x: cursor.x, y: cursor.y });
      group.scale({ x: 1 / scale, y: 1 / scale });
      const text = group.findOne<Konva.Text>(".cursor-label");
      const background = group.findOne<Konva.Rect>(".cursor-bg");
      if (text && text.text() !== cursor.displayName) {
        text.text(cursor.displayName);
        background?.width(text.width());
        background?.height(text.height());
      }
      background?.fill(cursor.color);
      const pointer = group.findOne(".cursor-pointer");
      pointer?.setAttr("fill", cursor.color);
    }
    for (const [clientId, group] of this.cursorNodes) {
      if (seen.has(clientId)) continue;
      group.destroy();
      this.cursorNodes.delete(clientId);
    }
    this.cursorLayer.batchDraw();
  }

  setTool(tool: Tool): void {
    void tool;
    this.applyMode();
    this.refreshTransformer();
  }

  setReadOnly(readOnly: boolean): void {
    void readOnly;
    if (readOnly) this.host.onSelect(null);
    this.applyMode();
    this.refreshTransformer();
  }

  setSpace(pressed: boolean): void {
    this.space = pressed;
    this.applyMode();
  }

  setEditing(id: string | null): void {
    this.editingId = id;
    for (const [shapeId, node] of this.nodes) {
      this.applyTextOpacity(node, shapeId);
    }
    this.shapesLayer.batchDraw();
  }

  select(id: string | null): void {
    this.refreshTransformer(id);
  }

  scale(): number {
    return this.stage.scaleX() || 1;
  }

  camera() {
    return {
      x: this.stage.x(),
      y: this.stage.y(),
      scale: this.scale(),
    };
  }

  worldToScreen(point: Point): Point {
    return worldToScreen(point, this.camera());
  }

  zoomBy(factor: number): void {
    const pointer = {
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    };
    this.applyZoom(pointer, this.scale() * factor);
  }

  resetView(): void {
    this.stage.scale({ x: 1, y: 1 });
    this.stage.position({ x: 0, y: 0 });
    this.afterCamera();
  }

  private bindNode(node: Konva.Node): void {
    node.dragDistance(4);
    node.on("dragstart", () => {
      this.activeId = node.id();
    });
    node.on("dragend", () => {
      this.commitNode(node);
    });
    node.on("transformstart", () => {
      this.activeId = node.id();
    });
    node.on("transformend", () => {
      this.commitNode(node);
    });
  }

  private commitNode(node: Konva.Node): void {
    const id = node.id();
    const shape = this.host.getShapes().find((item) => item.id === id);
    this.activeId = null;
    if (!shape || this.host.getReadOnly()) {
      this.sync(this.host.getShapes());
      return;
    }
    const geometry = geometryAfterTransform(shape, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX() || 1,
      scaleY: node.scaleY() || 1,
    });
    if (shape.type === "pen" && "points" in geometry) {
      this.host.store.setPenPoints(id, geometry.points);
      return;
    }
    this.host.store.updateGeometry(
      id,
      geometry as unknown as Record<string, number | string>,
    );
  }

  private onPointerDown(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ): void {
    if (isTransformerTarget(event.target)) return;
    const tool = this.host.getTool();
    const readOnly = this.host.getReadOnly();
    if (isMiddleClick(event.evt) || this.space || tool === "pan" || readOnly) {
      this.beginPan(event);
      return;
    }
    if (tool === "select") {
      this.host.onSelect(this.idOf(event.target));
      return;
    }
    this.beginDraw(event);
  }

  private onPointerMove(): void {
    const world = this.worldPoint();
    if (world) this.emitCursor(world);
    if (!this.gesture) return;
    if (this.gesture.kind === "pan") {
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      this.pendingPointer = pointer;
      return;
    }
    if (!world) return;
    this.updateDraw(this.gesture, world);
  }

  private onDoubleClick(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ): void {
    if (this.host.getReadOnly()) return;
    const id = this.idOf(event.target);
    if (!id) return;
    const shape = this.host.getShapes().find((item) => item.id === id);
    if (shape?.type === "text" || shape?.type === "sticky") {
      this.host.onEditText(id);
    }
  }

  private onWheel(event: Konva.KonvaEventObject<WheelEvent>): void {
    event.evt.preventDefault();
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    const factor = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
    this.applyZoom(pointer, this.scale() * factor);
  }

  private beginPan(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ): void {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    event.evt.preventDefault();
    this.panning = true;
    this.gesture = {
      kind: "pan",
      pointerX: pointer.x,
      pointerY: pointer.y,
      stageX: this.stage.x(),
      stageY: this.stage.y(),
    };
    this.shapesLayer.listening(false);
    this.uiLayer.listening(false);
    this.cached = false;
    try {
      this.shapesLayer.cache({ pixelRatio: 1 });
      this.cached = true;
    } catch {
      this.cached = false;
    }
    this.panFrames = 0;
    this.panStartedAt = performance.now();
    this.pendingPointer = pointer;
    cancelAnimationFrame(this.panRaf);
    this.panRaf = requestAnimationFrame(this.stepPan);
  }

  private readonly stepPan = (): void => {
    if (!this.panning || this.gesture?.kind !== "pan") return;
    const pointer = this.pendingPointer;
    if (pointer) {
      this.stage.position({
        x: this.gesture.stageX + (pointer.x - this.gesture.pointerX),
        y: this.gesture.stageY + (pointer.y - this.gesture.pointerY),
      });
      this.syncGrid();
      this.stage.batchDraw();
    }
    this.panFrames += 1;
    this.panRaf = requestAnimationFrame(this.stepPan);
  };

  private beginDraw(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ): void {
    if (this.host.getReadOnly()) return;
    const world = this.worldPoint();
    if (!world) return;
    event.evt.preventDefault();
    const tool = this.host.getTool();
    const style = this.drawingStyle(tool);
    const id = this.createShape(tool, world, style);
    if (!id) return;
    this.host.onSelect(id);
    if (tool === "text") {
      this.host.onEditText(id);
      return;
    }
    this.gesture = {
      kind: "draw",
      id,
      tool,
      originX: world.x,
      originY: world.y,
      lastX: world.x,
      lastY: world.y,
    };
  }

  private createShape(
    tool: Tool,
    world: Point,
    style: ShapeStyle,
  ): string | null {
    const store = this.host.store;
    if (tool === "pen") {
      return store.add({
        type: "pen",
        geometry: { points: [world.x, world.y] },
        style,
      });
    }
    if (tool === "rect") {
      return store.add({
        type: "rect",
        geometry: { x: world.x, y: world.y, width: 0, height: 0 },
        style,
      });
    }
    if (tool === "ellipse") {
      return store.add({
        type: "ellipse",
        geometry: { x: world.x, y: world.y, radiusX: 0, radiusY: 0 },
        style,
      });
    }
    if (tool === "line" || tool === "arrow") {
      return store.add({
        type: tool,
        geometry: { x1: world.x, y1: world.y, x2: world.x, y2: world.y },
        style,
      });
    }
    if (tool === "sticky") {
      return store.add({
        type: "sticky",
        geometry: {
          x: world.x,
          y: world.y,
          width: 0,
          height: 0,
          text: "Note",
        },
        style,
      });
    }
    if (tool === "text") {
      return store.add({
        type: "text",
        geometry: {
          x: world.x,
          y: world.y,
          text: "Text",
          fontSize: 22,
          width: 240,
        },
        style,
      });
    }
    return null;
  }

  private updateDraw(gesture: DrawGesture, world: Point): void {
    const store = this.host.store;
    if (gesture.tool === "pen") {
      if (distance(world, { x: gesture.lastX, y: gesture.lastY }) < 1.4) return;
      store.appendPenPoints(gesture.id, [world.x, world.y]);
      gesture.lastX = world.x;
      gesture.lastY = world.y;
      return;
    }
    if (gesture.tool === "rect" || gesture.tool === "sticky") {
      const box = normalizeBox(
        gesture.originX,
        gesture.originY,
        world.x,
        world.y,
      );
      store.updateGeometry(gesture.id, box);
      return;
    }
    if (gesture.tool === "ellipse") {
      store.updateGeometry(
        gesture.id,
        ellipseFromCorners(gesture.originX, gesture.originY, world.x, world.y),
      );
      return;
    }
    if (gesture.tool === "line" || gesture.tool === "arrow") {
      store.updateGeometry(gesture.id, { x2: world.x, y2: world.y });
    }
  }

  private finishGesture(): void {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;
    if (gesture.kind === "pan") {
      this.finishPan();
      return;
    }
    this.finishDraw(gesture);
  }

  private finishPan(): void {
    this.panning = false;
    cancelAnimationFrame(this.panRaf);
    if (this.cached) {
      this.shapesLayer.clearCache();
      this.cached = false;
    }
    this.applyMode();
    this.stage.batchDraw();
    this.afterCamera();
    const seconds = (performance.now() - this.panStartedAt) / 1000;
    if (seconds > 0.25) {
      this.host.onPanFps(Math.round(this.panFrames / seconds));
    }
  }

  private finishDraw(gesture: DrawGesture): void {
    const shape = this.host.store.get(gesture.id);
    if (!shape) return;
    if (shape.type === "rect" || shape.type === "sticky") {
      const tiny = shape.geometry.width < 4 && shape.geometry.height < 4;
      if (tiny && shape.type === "rect") {
        this.host.store.delete(gesture.id);
        return;
      }
      if (shape.type === "sticky" && tiny) {
        this.host.store.updateGeometry(gesture.id, { width: 180, height: 150 });
      }
    }
    if (shape.type === "ellipse") {
      if (shape.geometry.radiusX < 2 && shape.geometry.radiusY < 2) {
        this.host.store.delete(gesture.id);
        return;
      }
    }
    if (shape.type === "line" || shape.type === "arrow") {
      const length = Math.hypot(
        shape.geometry.x2 - shape.geometry.x1,
        shape.geometry.y2 - shape.geometry.y1,
      );
      if (length < 3) {
        this.host.store.delete(gesture.id);
        return;
      }
    }
    if (shape.type === "pen" && shape.geometry.points.length < 4) {
      const x = shape.geometry.points[0] ?? 0;
      const y = shape.geometry.points[1] ?? 0;
      this.host.store.appendPenPoints(gesture.id, [x + 0.8, y + 0.8]);
    }
    this.host.onSelect(gesture.id);
  }

  private drawingStyle(tool: Tool): ShapeStyle {
    const style = { ...this.host.getStyle() };
    if (tool === "sticky" && style.fill === "transparent") {
      style.fill = DEFAULT_STICKY_FILL;
    }
    return style;
  }

  private applyZoom(pointer: Point, nextScale: number): void {
    const next = zoomAt({
      pointer,
      camera: this.camera(),
      nextScale,
    });
    this.stage.scale({ x: next.scale, y: next.scale });
    this.stage.position({ x: next.x, y: next.y });
    this.afterCamera();
  }

  private afterCamera(): void {
    this.syncGrid();
    this.syncCursors(currentCursors(this.cursorNodes));
    this.stage.batchDraw();
    this.host.onCamera();
  }

  private syncGrid(): void {
    const scale = this.scale();
    const size = 28 * scale;
    this.container.style.backgroundSize = `${size}px ${size}px`;
    this.container.style.backgroundPosition = `${this.stage.x()}px ${this.stage.y()}px`;
  }

  private applyMode(): void {
    const hit = this.canDrag() && !this.panning;
    this.shapesLayer.listening(hit);
    this.uiLayer.listening(hit);
    for (const node of this.nodes.values()) node.draggable(this.canDrag());
  }

  private canDrag(): boolean {
    return (
      this.host.getTool() === "select" &&
      !this.host.getReadOnly() &&
      !this.space &&
      !this.panning
    );
  }

  private refreshTransformer(id = this.host.getSelectedId()): void {
    const node = id ? this.nodes.get(id) : undefined;
    if (!node || !this.canDrag()) {
      this.transformer.nodes([]);
    } else {
      this.transformer.nodes([node]);
      this.transformer.moveToTop();
    }
    this.transformer.forceUpdate();
    this.uiLayer.batchDraw();
  }

  private applyTextOpacity(node: Konva.Node, id: string): void {
    const hidden = this.editingId === id;
    if (node.getAttr("shapeType") === "text") {
      node.opacity(hidden ? 0 : 1);
      return;
    }
    if (node.getAttr("shapeType") === "sticky" && node instanceof Konva.Group) {
      node.findOne(".sticky-text")?.opacity(hidden ? 0 : 1);
    }
  }

  private worldPoint(): Point | null {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    return screenToWorld(pointer, this.camera());
  }

  private idOf(target: Konva.Node): string | null {
    let current: Konva.Node | null = target;
    while (current && current !== this.stage) {
      if (current.name() === "shape" && current.id()) return current.id();
      current = current.getParent();
    }
    return null;
  }

  private emitCursor(point: Point | null): void {
    if (!point) {
      this.cursorClear = true;
      this.host.onCursor(null);
      return;
    }
    this.cursorClear = false;
    this.cursorPoint = point;
    if (this.cursorRaf) return;
    this.cursorRaf = requestAnimationFrame(() => {
      this.cursorRaf = 0;
      if (!this.cursorClear && this.cursorPoint) {
        this.host.onCursor(this.cursorPoint);
      }
    });
  }
}

function isMiddleClick(event: Event): boolean {
  return event instanceof MouseEvent && event.button === 1;
}

function isTransformerTarget(target: Konva.Node): boolean {
  let current: Konva.Node | null = target;
  while (current) {
    if (current.getClassName() === "Transformer") return true;
    current = current.getParent();
  }
  return false;
}

function createCursor(cursor: RemoteCursor): Konva.Group {
  const group = new Konva.Group({
    x: cursor.x,
    y: cursor.y,
    listening: false,
  });
  group.add(
    new Konva.Path({
      name: "cursor-pointer",
      data: "M1 1 L1 16 L5.4 12.2 L8.8 19 L11.2 17.9 L7.8 11.1 L13.4 10.8 Z",
      fill: cursor.color,
      stroke: "#fffaf3",
      strokeWidth: 1,
      listening: false,
    }),
  );
  const text = new Konva.Text({
    name: "cursor-label",
    text: cursor.displayName,
    fontSize: 12,
    fontFamily: "Outfit, sans-serif",
    fill: "#fffaf3",
    padding: 4,
    listening: false,
  });
  const label = new Konva.Group({ x: 16, y: 18, listening: false });
  label.add(
    new Konva.Rect({
      name: "cursor-bg",
      width: text.width(),
      height: text.height(),
      fill: cursor.color,
      cornerRadius: 4,
      listening: false,
    }),
  );
  label.add(text);
  group.add(label);
  return group;
}

function currentCursors(nodes: Map<number, Konva.Group>): RemoteCursor[] {
  const cursors: RemoteCursor[] = [];
  nodes.forEach((group, clientId) => {
    const text = group.findOne<Konva.Text>(".cursor-label");
    const background = group.findOne<Konva.Rect>(".cursor-bg");
    cursors.push({
      clientId,
      displayName: text?.text() ?? "",
      color: String(background?.fill() ?? "#0f6e62"),
      x: group.x(),
      y: group.y(),
    });
  });
  return cursors;
}
