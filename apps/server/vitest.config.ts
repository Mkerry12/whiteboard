import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**", "test/integration/**"],
  },
});
