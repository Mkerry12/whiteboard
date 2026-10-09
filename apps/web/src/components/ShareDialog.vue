<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { BoardId } from "@whiteboard/shared";
import { getApi } from "../api";
import type { BoardRole, ShareLink } from "../api/types";

const props = defineProps<{ boardId: BoardId }>();
const emit = defineEmits<{ close: [] }>();

const editLink = ref<ShareLink | null>(null);
const readLink = ref<ShareLink | null>(null);
const error = ref("");
const copied = ref<BoardRole | null>(null);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  error.value = "";
  try {
    const api = getApi();
    const [edit, read] = await Promise.all([
      api.createShareLink(props.boardId, "edit"),
      api.createShareLink(props.boardId, "read"),
    ]);
    editLink.value = edit;
    readLink.value = read;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not create links";
  }
}

function absolute(link: ShareLink | null): string {
  if (!link) return "";
  return new URL(link.path, window.location.origin).href;
}

async function copy(role: BoardRole, link: ShareLink | null): Promise<void> {
  const value = absolute(link);
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = role;
  } catch {
    copied.value = null;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')" @keydown="onKeydown">
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
    >
      <header class="modal-head">
        <h2 id="share-title">Share this board</h2>
        <button class="text-button" type="button" @click="emit('close')">
          Close
        </button>
      </header>
      <p v-if="error" class="form-error">{{ error }}</p>
      <section class="share-block">
        <h3>Can edit</h3>
        <p>Anyone with this link can draw.</p>
        <div class="share-row">
          <input readonly :value="absolute(editLink)" aria-label="Edit link" />
          <button type="button" class="primary" @click="copy('edit', editLink)">
            {{ copied === "edit" ? "Copied" : "Copy" }}
          </button>
        </div>
      </section>
      <section class="share-block">
        <h3>View only</h3>
        <p>
          Anyone with this link can look, but the drawing tools stay hidden.
        </p>
        <div class="share-row">
          <input
            readonly
            :value="absolute(readLink)"
            aria-label="View-only link"
          />
          <button type="button" class="primary" @click="copy('read', readLink)">
            {{ copied === "read" ? "Copied" : "Copy" }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
