import { createHttpApi } from "./http";
import { createMockApi } from "./mock";
import type { WhiteboardApi } from "./types";

export function useMockApi(): boolean {
  return import.meta.env.VITE_USE_MOCK !== "false";
}

export function syncUrl(): string {
  return import.meta.env.VITE_SYNC_URL || "ws://localhost:1234";
}

export function apiUrl(): string {
  return import.meta.env.VITE_API_URL || "http://localhost:3000";
}

let tokenGetter: () => string | null = () => null;

export function setApiTokenGetter(getter: () => string | null): void {
  tokenGetter = getter;
}

let singleton: WhiteboardApi | null = null;

export function getApi(): WhiteboardApi {
  if (!singleton) {
    const getToken = () => tokenGetter();
    singleton = useMockApi()
      ? createMockApi({ getToken })
      : createHttpApi({ baseUrl: apiUrl(), getToken });
  }
  return singleton;
}
