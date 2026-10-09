import { Hocuspocus } from "@hocuspocus/server";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { COLLABORATION_PATH } from "./contract.js";

export function attachCollaboration(
  httpServer: HttpServer,
  hocuspocus: Hocuspocus,
): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== COLLABORATION_PATH) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      hocuspocus.handleConnection(ws, request);
    });
  });

  httpServer.on("close", () => {
    wss.close();
  });
}
