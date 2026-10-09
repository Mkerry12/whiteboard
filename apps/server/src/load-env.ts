import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(serverRoot, "../..");

loadEnv({ path: resolve(repoRoot, ".env") });
loadEnv({ path: resolve(serverRoot, ".env"), override: true });
