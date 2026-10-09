import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getApi, setApiTokenGetter } from "../api";
import type { Session } from "../api/types";

const SESSION_KEY = "whiteboard.session";

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed.user?.id || !parsed.user.displayName)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(readSession());
  setApiTokenGetter(() => session.value?.token ?? null);

  const isAuthenticated = computed(() => session.value !== null);
  const user = computed(() => session.value?.user ?? null);

  async function register(
    displayName: string,
    password: string,
  ): Promise<void> {
    session.value = await getApi().register({ displayName, password });
    localStorage.setItem(SESSION_KEY, JSON.stringify(session.value));
  }

  async function login(displayName: string, password: string): Promise<void> {
    session.value = await getApi().login({ displayName, password });
    localStorage.setItem(SESSION_KEY, JSON.stringify(session.value));
  }

  function logout(): void {
    const token = session.value?.token;
    session.value = null;
    localStorage.removeItem(SESSION_KEY);
    if (token) void getApi().logout();
  }

  return { session, isAuthenticated, user, register, login, logout };
});
