<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { CanvasEngine } from "../canvas/engine";
import { toolFromShortcut, type Tool } from "../canvas/tools";
import type { RemoteCursor } from "../sync/peers";
import type { ShapeStore } from "../sync/shapeStore";
import type { ShapeSnapshot, ShapeStyle } from "../sync/types";
import { isTypingTarget } from "../utils/dom";

const props = defineProps<{
  shapes: ShapeSnapshot[];
  store: ShapeStore;
  readOnly: boolean;
  stroke: string;
  strokeWidth: number;
  fill: string;
  cursors: RemoteCursor[];
}>();

const tool = defineModel<Tool>("tool", { required: true });
const selectedId = defineModel<string | null>("selectedId", { required: true });

const emit = defineEmits<{
  cursor: [point: { x: number; y: number } | null];
  "pan-fps": [fps: number];
}>();

const host = ref<HTMLDivElement | null>(null);
const textArea = ref<HTMLTextAreaElement | null>(null);
const engineRef = shallowRef<CanvasEngine | null>(null);
const viewScale = ref(1);
const panFps = ref<number | null>(null);
const editingId = ref<string | null>(null);
const draftText = ref("");
const editorBox = ref<{
  left: number;
  top: number;
  width: number;
  fontSize: number;
  color: string;
} | null>(null);

let fpsTimer = 0;

function currentStyle(): ShapeStyle {
  return {
    stroke: props.stroke,
    strokeWidth: props.strokeWidth,
    fill: props.fill,
  };
}

function repositionEditor(): void {
  const engine = engineRef.value;
  if (!engine || !editingId.value) return;
  const shape = props.shapes.find((item) => item.id === editingId.value);
  if (!shape || (shape.type !== "text" && shape.type !== "sticky")) {
    editorBox.value = null;
    return;
  }
  const screen = engine.worldToScreen({
    x: shape.geometry.x,
    y: shape.geometry.y,
  });
  const scale = engine.scale();
  const fontSize =
    shape.type === "text" ? shape.geometry.fontSize * scale : 16 * scale;
  const width =
    shape.type === "text"
      ? shape.geometry.width * scale
      : Math.max((shape.geometry.width - 24) * scale, 80);
  editorBox.value = {
    left: screen.x + (shape.type === "sticky" ? 12 * scale : 0),
    top: screen.y + (shape.type === "sticky" ? 12 * scale : 0),
    width,
    fontSize,
    color: shape.type === "sticky" ? "#3f2d16" : shape.style.stroke,
  };
}

function startEdit(id: string): void {
  const shape = props.shapes.find((item) => item.id === id);
  if (!shape || props.readOnly) return;
  if (shape.type !== "text" && shape.type !== "sticky") return;
  editingId.value = id;
  draftText.value = shape.geometry.text;
  engineRef.value?.setEditing(id);
  repositionEditor();
  requestAnimationFrame(() => {
    textArea.value?.focus();
    textArea.value?.select();
  });
}

function commitEdit(): void {
  const id = editingId.value;
  if (!id) return;
  const text = draftText.value;
  editingId.value = null;
  editorBox.value = null;
  engineRef.value?.setEditing(null);
  if (text.trim() === "") {
    props.store.delete(id);
    if (selectedId.value === id) selectedId.value = null;
    return;
  }
  props.store.updateGeometry(id, { text });
}

function onKeyDown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) return;
  if (event.code === "Space") {
    engineRef.value?.setSpace(true);
    event.preventDefault();
    return;
  }
  if (event.key === "+" || event.key === "=") {
    engineRef.value?.zoomBy(1.1);
    event.preventDefault();
    return;
  }
  if (event.key === "-" || event.key === "_") {
    engineRef.value?.zoomBy(1 / 1.1);
    event.preventDefault();
    return;
  }
  if (event.key === "0") {
    engineRef.value?.resetView();
    return;
  }
  if (props.readOnly) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    if (selectedId.value) {
      props.store.delete(selectedId.value);
      selectedId.value = null;
      event.preventDefault();
    }
    return;
  }
  if (event.key === "]" && selectedId.value) {
    props.store.bringForward(selectedId.value);
    return;
  }
  if (event.key === "[" && selectedId.value) {
    props.store.sendBackward(selectedId.value);
    return;
  }
  const next = toolFromShortcut(event.key);
  if (next) tool.value = next;
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code === "Space") engineRef.value?.setSpace(false);
}

function zoomBy(factor: number): void {
  engineRef.value?.zoomBy(factor);
}

function resetView(): void {
  engineRef.value?.resetView();
}

onMounted(() => {
  if (!host.value) return;
  const engine = new CanvasEngine(host.value, {
    store: props.store,
    getShapes: () => props.shapes,
    getTool: () => tool.value,
    getStyle: currentStyle,
    getReadOnly: () => props.readOnly,
    getSelectedId: () => selectedId.value,
    onSelect: (id) => {
      selectedId.value = id;
    },
    onCursor: (point) => {
      emit("cursor", point);
    },
    onEditText: startEdit,
    onCamera: () => {
      viewScale.value = engine.scale();
      repositionEditor();
    },
    onPanFps: (fps) => {
      panFps.value = fps;
      emit("pan-fps", fps);
      window.clearTimeout(fpsTimer);
      fpsTimer = window.setTimeout(() => {
        panFps.value = null;
      }, 4000);
    },
  });
  engineRef.value = engine;
  engine.sync(props.shapes);
  engine.syncCursors(props.cursors);
  viewScale.value = engine.scale();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
});

watch(
  () => props.shapes,
  (shapes) => {
    engineRef.value?.sync(shapes);
    if (editingId.value) repositionEditor();
  },
);

watch(
  () => props.cursors,
  (cursors) => {
    engineRef.value?.syncCursors(cursors);
  },
);

watch(tool, () => {
  engineRef.value?.setTool(tool.value);
});

watch(
  () => props.readOnly,
  (readOnly) => {
    engineRef.value?.setReadOnly(readOnly);
    if (readOnly) commitEdit();
  },
);

watch(selectedId, (id) => {
  engineRef.value?.select(id);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.clearTimeout(fpsTimer);
  engineRef.value?.destroy();
  engineRef.value = null;
});
</script>

<template>
  <div ref="host" class="canvas-host" :data-tool="readOnly ? 'pan' : tool">
    <textarea
      v-if="editorBox"
      ref="textArea"
      v-model="draftText"
      class="text-editor"
      :style="{
        left: `${editorBox.left}px`,
        top: `${editorBox.top}px`,
        width: `${editorBox.width}px`,
        fontSize: `${editorBox.fontSize}px`,
        color: editorBox.color,
      }"
      aria-label="Shape text"
      @blur="commitEdit"
      @keydown.esc.prevent="commitEdit"
      @keydown.meta.enter.prevent="commitEdit"
      @keydown.ctrl.enter.prevent="commitEdit"
    />
    <div class="zoom-bar">
      <button type="button" aria-label="Zoom out" @click="zoomBy(1 / 1.1)">
        −
      </button>
      <button type="button" @click="resetView">
        {{ Math.round(viewScale * 100) }}%
      </button>
      <button type="button" aria-label="Zoom in" @click="zoomBy(1.1)">+</button>
    </div>
    <p v-if="panFps !== null" class="pan-fps" data-testid="pan-fps">
      Pan {{ panFps }} fps
    </p>
  </div>
</template>
