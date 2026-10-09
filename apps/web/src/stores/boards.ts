import { defineStore } from "pinia";
import { ref } from "vue";
import { getApi } from "../api";
import type { BoardSummary } from "../api/types";

export const useBoardsStore = defineStore("boards", () => {
  const boards = ref<BoardSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      boards.value = await getApi().listBoards();
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Could not load boards";
    } finally {
      loading.value = false;
    }
  }

  async function create(name: string): Promise<BoardSummary> {
    const board = await getApi().createBoard({ name });
    boards.value = [
      board,
      ...boards.value.filter((item) => item.id !== board.id),
    ];
    return board;
  }

  async function rename(id: string, name: string): Promise<void> {
    const board = await getApi().renameBoard(id, name);
    boards.value = boards.value.map((item) => (item.id === id ? board : item));
  }

  async function remove(id: string): Promise<void> {
    await getApi().deleteBoard(id);
    boards.value = boards.value.filter((item) => item.id !== id);
  }

  return { boards, loading, error, refresh, create, rename, remove };
});
