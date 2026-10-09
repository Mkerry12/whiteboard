<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { MOCK_STORAGE_KEY } from "../api/mock";
import { useMockApi } from "../api";
import { useAuthStore } from "../stores/auth";
import { useBoardsStore } from "../stores/boards";
import { formatRelativeTime, initials } from "../utils/dom";

const router = useRouter();
const auth = useAuthStore();
const boards = useBoardsStore();
const draftName = ref("");
const creating = ref(false);
const editingId = ref<string | null>(null);
const editingName = ref("");
const confirmingId = ref<string | null>(null);
const actionError = ref("");

onMounted(() => {
  void boards.refresh();
  window.addEventListener("storage", onStorage);
});

onUnmounted(() => {
  window.removeEventListener("storage", onStorage);
});

function onStorage(event: StorageEvent): void {
  if (useMockApi() && event.key === MOCK_STORAGE_KEY) void boards.refresh();
}

async function createBoard(): Promise<void> {
  actionError.value = "";
  creating.value = true;
  try {
    const board = await boards.create(draftName.value || "Untitled board");
    draftName.value = "";
    await router.push(`/boards/${board.id}`);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Could not create";
  } finally {
    creating.value = false;
  }
}

function startRename(id: string, name: string): void {
  editingId.value = id;
  editingName.value = name;
  confirmingId.value = null;
}

async function commitRename(id: string): Promise<void> {
  const name = editingName.value.trim();
  editingId.value = null;
  if (!name) return;
  try {
    await boards.rename(id, name);
    actionError.value = "";
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Could not rename";
  }
}

async function remove(id: string): Promise<void> {
  try {
    await boards.remove(id);
    confirmingId.value = null;
    actionError.value = "";
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Could not delete";
  }
}

function logout(): void {
  auth.logout();
  void router.push("/login");
}
</script>

<template>
  <div class="list-page">
    <header class="topbar">
      <span class="brand">Whiteboard</span>
      <span v-if="auth.user" class="who">
        <span class="avatar" :style="{ background: auth.user.color }">
          {{ initials(auth.user.displayName) }}
        </span>
        {{ auth.user.displayName }}
      </span>
      <button type="button" class="ghost" @click="logout">Log out</button>
    </header>
    <main class="list-main">
      <div class="list-heading">
        <div>
          <p class="kicker">Library</p>
          <h1>Your boards</h1>
        </div>
        <form class="create-form" @submit.prevent="createBoard">
          <input
            v-model="draftName"
            placeholder="New board name"
            aria-label="New board name"
            maxlength="80"
          />
          <button class="primary" type="submit" :disabled="creating">
            Create
          </button>
        </form>
      </div>
      <p v-if="boards.error || actionError" class="form-error">
        {{ actionError || boards.error }}
      </p>
      <p v-if="boards.loading" class="muted">Loading boards…</p>
      <div v-else class="board-grid">
        <article v-if="boards.boards.length === 0" class="board-empty">
          <h2>Nothing on the wall yet</h2>
          <p>Create a board and open it in two windows to draw together.</p>
        </article>
        <article
          v-for="board in boards.boards"
          :key="board.id"
          class="board-card"
        >
          <RouterLink class="card-link" :to="`/boards/${board.id}`">
            <span class="card-mark" />
            <h2 v-if="editingId !== board.id">{{ board.name }}</h2>
          </RouterLink>
          <form
            v-if="editingId === board.id"
            class="rename-form"
            @submit.prevent="commitRename(board.id)"
          >
            <input
              v-model="editingName"
              aria-label="Rename board"
              @blur="commitRename(board.id)"
              @keydown.esc="editingId = null"
            />
          </form>
          <p class="muted">Updated {{ formatRelativeTime(board.updatedAt) }}</p>
          <div class="card-actions">
            <button
              type="button"
              class="text-button"
              @click="startRename(board.id, board.name)"
            >
              Rename
            </button>
            <button
              v-if="confirmingId !== board.id"
              type="button"
              class="text-button danger"
              @click="confirmingId = board.id"
            >
              Delete
            </button>
            <button
              v-else
              type="button"
              class="text-button danger"
              @click="remove(board.id)"
            >
              Confirm delete
            </button>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>
