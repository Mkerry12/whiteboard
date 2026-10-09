import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  registerUser,
  resetDatabase,
  type TestContext,
} from "./helpers.js";

describe("auth", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.db);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("registers a user and returns a JWT", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "Ada@Example.com",
        password: "password123",
        name: "Ada",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ email: "ada@example.com", name: "Ada" });
    expect(body.user.id).toEqual(expect.any(String));
    expect(body.user.createdAt).toEqual(expect.any(String));
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("rejects duplicate emails and invalid bodies", async () => {
    await registerUser(ctx.app, { email: "ada@example.com" });

    const duplicate = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "ada@example.com",
        password: "password123",
        name: "Ada",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("CONFLICT");

    const invalid = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "not-an-email", password: "short", name: "" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("VALIDATION_ERROR");
    expect(invalid.json().error.details.length).toBeGreaterThan(0);
  });

  it("logs in with the normalized email and rejects bad credentials", async () => {
    const registered = await registerUser(ctx.app, {
      email: "ada@example.com",
      password: "password123",
    });

    const loggedIn = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ADA@example.com", password: "password123" },
    });
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().user.id).toBe(registered.user.id);
    expect(loggedIn.json().accessToken).toEqual(expect.any(String));

    const wrongPassword = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ada@example.com", password: "password999" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json().error).toEqual({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    const unknown = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "missing@example.com", password: "password123" },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe("Invalid email or password");
  });

  it("returns the current user only for a valid bearer token", async () => {
    const registered = await registerUser(ctx.app);

    const me = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: bearer(registered.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toEqual(registered.user);

    const missing = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe("UNAUTHORIZED");

    const bogus = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: bearer("not-a-jwt"),
    });
    expect(bogus.statusCode).toBe(401);
  });
});
