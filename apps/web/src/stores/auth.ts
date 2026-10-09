import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getApi, setApiTokenGetter } from "../api";
import type { Session } from "../api/types";
import type { PresenceUser } from "../sync/peers";
import { colorFromId } from "../theme/palette";

const SESSION_KEY = "whiteboard.session";

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (
      !parsed?.accessToken ||
      !parsed.user?.id ||
      !parsed.user.email ||
      !parsed.user.name
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(readSession());
  setApiTokenGetter(() => session.value?.accessToken ?? null);

  const isAuthenticated = computed(() => session.value !== null);
  const user = computed(() => session.value?.user ?? null);
  const presence = computed<PresenceUser | null>(() => {
    const current = user.value;
    if (!current) return null;
    return {
      id: current.id,
      displayName: current.name,
      color: colorFromId(current.id),
    };
  });

  function persist(next: Session): void {
    session.value = next;
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }

  async function register(
    email: string,
    name: string,
    password: string,
  ): Promise<void> {
    persist(await getApi().register({ email, name, password }));
  }

  async function login(email: string, password: string): Promise<void> {
    persist(await getApi().login({ email, password }));
  }

  function logout(): void {
    const token = session.value?.accessToken;
    session.value = null;
    localStorage.removeItem(SESSION_KEY);
    if (token) void getApi().logout();
  }

  return {
    session,
    isAuthenticated,
    user,
    presence,
    register,
    login,
    logout,
  };
});
