<script setup lang="ts">
import { onMounted, ref, watchEffect } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getApi } from "../api";
import { collaborationToken } from "../api/contract";
import type { BoardAccess } from "../api/types";
import { routeParam } from "../router/guard";
import { useAuthStore } from "../stores/auth";
import BoardSession from "../components/BoardSession.vue";

const route = useRoute();
const auth = useAuthStore();
const access = ref<BoardAccess | null>(null);
const error = ref("");
const loading = ref(true);

const share = typeof route.query.share === "string" ? route.query.share : "";
const canManage = !share;

onMounted(() => {
  void openBoard();
});

async function openBoard(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const boardId = routeParam(route.params.boardId);
    if (share) {
      const board = await getApi().redeemShareToken(share);
      if (board.id !== boardId) {
        throw new Error("This share link does not match the board");
      }
      access.value = {
        board,
        role: board.role,
        token: collaborationToken("share", share),
      };
    } else {
      const board = await getApi().getBoard(boardId);
      const accessToken = auth.session?.accessToken;
      if (!accessToken) throw new Error("Sign in required");
      access.value = {
        board,
        role: board.role,
        token: collaborationToken("jwt", accessToken),
      };
    }
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Could not open the board";
  } finally {
    loading.value = false;
  }
}

watchEffect(() => {
  document.title = access.value
    ? `${access.value.board.title} · Whiteboard`
    : "Whiteboard";
});
</script>

<template>
  <BoardSession
    v-if="access && auth.presence"
    :key="access.board.id + access.role + access.token"
    :access="access"
    :user="auth.presence"
    :can-manage="canManage && access.role === 'owner'"
  />
  <main v-else class="gate">
    <p v-if="loading">Opening board…</p>
    <template v-else>
      <h1>Could not open this board</h1>
      <p>{{ error }}</p>
      <RouterLink to="/boards">Back to boards</RouterLink>
    </template>
  </main>
</template>
