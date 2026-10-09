<script setup lang="ts">
import { onMounted, ref, watchEffect } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getApi } from "../api";
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
      const redeemed = await getApi().redeemShareToken(share);
      if (redeemed.board.id !== boardId) {
        throw new Error("This share link does not match the board");
      }
      access.value = redeemed;
    } else {
      access.value = await getApi().getBoard(boardId);
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
    ? `${access.value.board.name} · Whiteboard`
    : "Whiteboard";
});
</script>

<template>
  <BoardSession
    v-if="access && auth.user"
    :key="access.board.id + access.role + access.token"
    :access="access"
    :user="auth.user"
    :can-manage="canManage && access.role === 'edit'"
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
