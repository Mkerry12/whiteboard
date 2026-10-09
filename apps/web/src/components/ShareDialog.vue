<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { BoardId } from "@whiteboard/shared";
import { getApi } from "../api";
import { shareLinkPath } from "../api/contract";
import type { ShareLink, ShareRole } from "../api/types";

const props = defineProps<{ boardId: BoardId }>();
const emit = defineEmits<{ close: [] }>();

const editorLink = ref<ShareLink | null>(null);
const viewerLink = ref<ShareLink | null>(null);
const error = ref("");
const copied = ref<ShareRole | null>(null);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  error.value = "";
  try {
    const api = getApi();
    const existing = await api.listShareLinks(props.boardId);
    const active = existing.filter((link) => link.revokedAt === null);
    editorLink.value =
      active.find((link) => link.role === "editor") ??
      (await api.createShareLink(props.boardId, "editor"));
    viewerLink.value =
      active.find((link) => link.role === "viewer") ??
      (await api.createShareLink(props.boardId, "viewer"));
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not create links";
  }
}

function absolute(link: ShareLink | null): string {
  if (!link || link.revokedAt) return "";
  return new URL(shareLinkPath(link), window.location.origin).href;
}

async function copy(role: ShareRole, link: ShareLink | null): Promise<void> {
  const value = absolute(link);
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = role;
  } catch {
    copied.value = null;
  }
}

async function revoke(role: ShareRole): Promise<void> {
  const link = role === "editor" ? editorLink.value : viewerLink.value;
  if (!link) return;
  error.value = "";
  try {
    await getApi().revokeShareLink(props.boardId, link.id);
    if (role === "editor") editorLink.value = null;
    else viewerLink.value = null;
    if (copied.value === role) copied.value = null;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Could not revoke the link";
  }
}

async function create(role: ShareRole): Promise<void> {
  error.value = "";
  try {
    const link = await getApi().createShareLink(props.boardId, role);
    if (role === "editor") editorLink.value = link;
    else viewerLink.value = link;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not create links";
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
          <input
            readonly
            :value="absolute(editorLink)"
            aria-label="Edit link"
            data-testid="share-editor-link"
          />
          <button
            type="button"
            class="primary"
            :disabled="!editorLink"
            @click="copy('editor', editorLink)"
          >
            {{ copied === "editor" ? "Copied" : "Copy" }}
          </button>
          <button
            v-if="editorLink"
            type="button"
            class="text-button danger"
            data-testid="revoke-editor"
            @click="revoke('editor')"
          >
            Revoke
          </button>
          <button
            v-else
            type="button"
            class="text-button"
            @click="create('editor')"
          >
            New link
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
            :value="absolute(viewerLink)"
            aria-label="View-only link"
            data-testid="share-viewer-link"
          />
          <button
            type="button"
            class="primary"
            :disabled="!viewerLink"
            @click="copy('viewer', viewerLink)"
          >
            {{ copied === "viewer" ? "Copied" : "Copy" }}
          </button>
          <button
            v-if="viewerLink"
            type="button"
            class="text-button danger"
            data-testid="revoke-viewer"
            @click="revoke('viewer')"
          >
            Revoke
          </button>
          <button
            v-else
            type="button"
            class="text-button"
            @click="create('viewer')"
          >
            New link
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
