import { describe, expect, it } from "vitest";
import { guardNavigation, safeInternalPath } from "../src/router/guard";

describe("auth navigation", () => {
  it("sends an anonymous board visit to login and keeps the return path", () => {
    expect(
      guardNavigation({
        isAuthenticated: false,
        requiresAuth: true,
        guestOnly: false,
        fullPath: "/boards/abc?share=token",
      }),
    ).toEqual({
      name: "login",
      query: { redirect: "/boards/abc?share=token" },
    });
  });

  it("lets a signed-in person open a board", () => {
    expect(
      guardNavigation({
        isAuthenticated: true,
        requiresAuth: true,
        guestOnly: false,
        fullPath: "/boards/abc",
      }),
    ).toBeNull();
  });

  it("rejects external redirect targets", () => {
    expect(safeInternalPath("https://evil.example")).toBe("/boards");
    expect(safeInternalPath("//evil.example")).toBe("/boards");
    expect(safeInternalPath("/boards/abc?share=1")).toBe("/boards/abc?share=1");
  });
});
