import { Server } from "@hocuspocus/server";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDocument, storeDocument } from "./persistence";

const dataDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".data",
);

function readEnv(name: string): string | undefined {
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return proc?.env?.[name];
}

const port = Number(readEnv("SYNC_PORT") ?? 1234);
const address = readEnv("SYNC_HOST") ?? "0.0.0.0";

const server = new Server({
  port: Number.isFinite(port) ? port : 1234,
  address,
  quiet: true,
  debounce: 150,
  maxDebounce: 600,
  async onLoadDocument({ document, documentName }) {
    await loadDocument(dataDir, documentName, document);
  },
  async onStoreDocument({ document, documentName }) {
    await storeDocument(dataDir, documentName, document);
  },
});

server
  .listen()
  .then(() => {
    console.log(`Whiteboard dev sync listening on ${server.webSocketURL}`);
    console.log(`Documents persist in ${dataDir}`);
    console.log("Auth is off. Do not expose this process.");
  })
  .catch((error: unknown) => {
    console.error(error);
    const exit = (
      globalThis as { process?: { exit?: (code: number) => never } }
    ).process?.exit;
    exit?.(1);
  });
