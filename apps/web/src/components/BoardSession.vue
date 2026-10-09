<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { getApi, syncUrl } from "../api";
import { collaborationDocumentName } from "../api/contract";
import type { BoardAccess } from "../api/types";
import { addPerfShapes, ensureShapeCount } from "../canvas/seed";
import { showEditingTools, type Tool } from "../canvas/tools";
import { FILL_COLORS, STROKE_COLORS } from "../theme/palette";
import { useCollabSession } from "../sync/useCollabSession";
import type { PresenceUser } from "../sync/peers";
import { initials } from "../utils/dom";
import ShareDialog from "./ShareDialog.vue";
import ToolIcon from "./ToolIcon.vue";
import WhiteboardCanvas from "./WhiteboardCanvas.vue";
import { TOOLS } from "../canvas/tools";

const props = defineProps<{
  access: BoardAccess;
  user: PresenceUser;
  canManage: boolean;
}>();

const route = useRoute();
const {
  shapes,
  status,
  synced,
  peers,
  cursors,
  serverReadOnly,
  store,
  setCursor,
} = useCollabSession({
  url: syncUrl(),
  documentName: collaborationDocumentName(props.access.board.id),
  token: props.access.token,
  user: props.user,
});

const tool = ref<Tool>("select");
const selectedId = ref<string | null>(null);
const stroke = ref<string>(STROKE_COLORS[0]);
const strokeWidth = ref(3);
const fill = ref<string>("transparent");
const shareOpen = ref(false);
const boardName = ref(props.access.board.title);
const nameError = ref("");
const seeding = ref(false);
const devTools = import.meta.env.DEV;
let seededFromQuery = false;

const readOnly = computed(
  () => props.access.role === "viewer" || serverReadOnly.value,
);
const editing = computed(() => showEditingTools(readOnly.value));
const statusLabel = computed(() => {
  if (status.value === "connected") return "Live";
  if (status.value === "connecting") return "Connecting";
  return "Offline";
});

watch(readOnly, (locked) => {
  if (locked) tool.value = "pan";
});

watch(selectedId, (id) => {
  const shape = shapes.value.find((item) => item.id === id);
  if (!shape) return;
  stroke.value = shape.style.stroke;
  strokeWidth.value = shape.style.strokeWidth;
  fill.value = shape.style.fill;
});

watch(synced, (ready) => {
  if (!ready || !devTools || seededFromQuery) return;
  const raw = route.query.seed;
  const count = typeof raw === "string" ? Number(raw) : 0;
  if (!Number.isFinite(count) || count <= 0) return;
  seededFromQuery = true;
  ensureShapeCount(store, Math.min(Math.floor(count), 5000));
});

function chooseStroke(color: string): void {
  stroke.value = color;
  if (selectedId.value && !readOnly.value) {
    store.updateStyle(selectedId.value, { stroke: color });
  }
}

function chooseFill(color: string): void {
  fill.value = color;
  if (selectedId.value && !readOnly.value) {
    store.updateStyle(selectedId.value, { fill: color });
  }
}

function chooseWidth(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  strokeWidth.value = value;
  if (selectedId.value && !readOnly.value) {
    store.updateStyle(selectedId.value, { strokeWidth: value });
  }
}

function removeSelected(): void {
  if (!selectedId.value || readOnly.value) return;
  store.delete(selectedId.value);
  selectedId.value = null;
}

function bringForward(): void {
  if (!selectedId.value || readOnly.value) return;
  store.bringForward(selectedId.value);
}

function sendBackward(): void {
  if (!selectedId.value || readOnly.value) return;
  store.sendBackward(selectedId.value);
}

async function saveName(): Promise<void> {
  const name = boardName.value.trim();
  if (!name || name === props.access.board.title) return;
  try {
    const board = await getApi().renameBoard(props.access.board.id, name);
    boardName.value = board.title;
    nameError.value = "";
    document.title = `${board.title} · Whiteboard`;
  } catch (err) {
    nameError.value = err instanceof Error ? err.message : "Could not rename";
    boardName.value = props.access.board.title;
  }
}

function seed(): void {
  seeding.value = true;
  requestAnimationFrame(() => {
    addPerfShapes(store, 2000);
    seeding.value = false;
  });
}

function onCursor(point: { x: number; y: number } | null): void {
  setCursor(point);
}
</script>

<template>
  <div class="editor" :class="{ 'is-readonly': !editing }">
    <header class="topbar">
      <RouterLink class="brand" to="/boards">Whiteboard</RouterLink>
      <form class="name-form" @submit.prevent="saveName">
        <input
          v-if="canManage"
          v-model="boardName"
          class="name-input"
          aria-label="Board name"
          maxlength="200"
          @blur="saveName"
        />
        <h1 v-else class="board-title">{{ boardName }}</h1>
      </form>
      <p v-if="nameError" class="name-error">{{ nameError }}</p>
      <span v-if="readOnly" class="view-pill">View only</span>
      <div class="faces" aria-label="People here">
        <span
          class="avatar"
          :style="{ background: user.color }"
          :title="user.displayName"
        >
          {{ initials(user.displayName) }}
        </span>
        <span
          v-for="peer in peers.slice(0, 5)"
          :key="peer.clientId"
          class="avatar"
          :style="{ background: peer.user.color }"
          :title="peer.user.displayName"
        >
          {{ initials(peer.user.displayName) }}
        </span>
      </div>
      <span class="status" :data-status="status">
        {{ statusLabel }}
      </span>
      <button
        v-if="devTools"
        type="button"
        class="ghost"
        data-testid="seed-shapes"
        :disabled="seeding"
        @click="seed"
      >
        {{ seeding ? "Seeding…" : "Seed 2000" }}
      </button>
      <button
        v-if="canManage"
        type="button"
        class="primary"
        data-testid="share-board"
        @click="shareOpen = true"
      >
        Share
      </button>
    </header>

    <aside v-if="editing" class="tools" aria-label="Drawing tools">
      <div class="tool-group">
        <button
          v-for="item in TOOLS"
          :key="item.id"
          type="button"
          class="tool"
          :class="{ 'is-active': tool === item.id }"
          :aria-pressed="tool === item.id"
          :aria-label="item.label"
          :title="`${item.label} (${item.shortcut})`"
          @click="tool = item.id"
        >
          <ToolIcon :name="item.id" />
        </button>
      </div>
      <div class="tool-group">
        <button
          type="button"
          class="tool"
          title="Bring forward (])"
          aria-label="Bring forward"
          :disabled="!selectedId"
          @click="bringForward"
        >
          <ToolIcon name="forward" />
        </button>
        <button
          type="button"
          class="tool"
          title="Send backward ([)"
          aria-label="Send backward"
          :disabled="!selectedId"
          @click="sendBackward"
        >
          <ToolIcon name="backward" />
        </button>
        <button
          type="button"
          class="tool danger"
          title="Delete"
          aria-label="Delete"
          :disabled="!selectedId"
          @click="removeSelected"
        >
          <ToolIcon name="trash" />
        </button>
      </div>
      <div class="swatches" aria-label="Stroke color">
        <button
          v-for="color in STROKE_COLORS"
          :key="color"
          type="button"
          class="swatch"
          :class="{ 'is-active': stroke === color }"
          :style="{ background: color }"
          :aria-label="`Stroke ${color}`"
          :aria-pressed="stroke === color"
          @click="chooseStroke(color)"
        />
      </div>
      <label class="width">
        <span>Width {{ strokeWidth }}</span>
        <input
          type="range"
          min="1"
          max="16"
          :value="strokeWidth"
          @input="chooseWidth"
        />
      </label>
      <div class="swatches" aria-label="Fill color">
        <button
          v-for="color in FILL_COLORS"
          :key="color"
          type="button"
          class="swatch"
          :class="{
            'is-active': fill === color,
            'is-none': color === 'transparent',
          }"
          :style="color === 'transparent' ? undefined : { background: color }"
          :aria-label="color === 'transparent' ? 'No fill' : `Fill ${color}`"
          :aria-pressed="fill === color"
          @click="chooseFill(color)"
        />
      </div>
    </aside>

    <WhiteboardCanvas
      v-model:tool="tool"
      v-model:selected-id="selectedId"
      :shapes="shapes"
      :store="store"
      :read-only="readOnly"
      :stroke="stroke"
      :stroke-width="strokeWidth"
      :fill="fill"
      :cursors="cursors"
      @cursor="onCursor"
    />

    <ShareDialog
      v-if="shareOpen"
      :board-id="access.board.id"
      @close="shareOpen = false"
    />
  </div>
</template>
