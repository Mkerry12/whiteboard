import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";

describe("health without redis", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(null);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("fails readiness when redis is not configured", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/health/ready",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "unavailable",
      checks: { database: "ok", redis: "unavailable" },
    });
  });
});
