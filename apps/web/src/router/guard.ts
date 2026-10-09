export function safeInternalPath(value: unknown): string {
  if (typeof value !== "string") return "/boards";
  if (!value.startsWith("/") || value.startsWith("//")) return "/boards";
  return value;
}

export function guardNavigation(input: {
  isAuthenticated: boolean;
  requiresAuth: boolean;
  guestOnly: boolean;
  fullPath: string;
}): { name: "login"; query: { redirect: string } } | { name: "boards" } | null {
  if (input.requiresAuth && !input.isAuthenticated) {
    return { name: "login", query: { redirect: input.fullPath } };
  }
  if (input.guestOnly && input.isAuthenticated) {
    return { name: "boards" };
  }
  return null;
}

export function routeParam(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}
