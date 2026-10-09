import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@whiteboard/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**", "test/integration/**"],
  },
});
