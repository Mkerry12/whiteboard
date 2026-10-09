import { writeAuthentication } from "@hocuspocus/common";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import WebSocket from "ws";
import * as Y from "yjs";
import { writeUpdate } from "y-protocols/sync";

const MessageType = {
  Sync: 0,
  Auth: 2,
  SyncStatus: 8,
} as const;

const AuthMessageType = {
  PermissionDenied: 1,
  Authenticated: 2,
} as const;

export interface DecodedMessage {
  documentName: string;
  messageType: number;
  authType?: number;
  scope?: string;
  reason?: string;
  saved?: boolean;
}

function toBytes(data: WebSocket.RawData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(data);
}

function decodeMessage(data: Uint8Array): DecodedMessage {
  const decoder = decoding.createDecoder(data);
  const documentName = decoding.readVarString(decoder);
  const messageType = decoding.readVarUint(decoder);
  const message: DecodedMessage = { documentName, messageType };

  if (messageType === MessageType.Auth) {
    const authType = decoding.readVarUint(decoder);
    message.authType = authType;
    if (authType === AuthMessageType.Authenticated) {
      message.scope = decoding.readVarString(decoder);
    } else if (authType === AuthMessageType.PermissionDenied) {
      message.reason = decoding.readVarString(decoder);
    }
  } else if (messageType === MessageType.SyncStatus) {
    message.saved = decoding.readVarUint(decoder) === 1;
  }

  return message;
}

export function updateForShape(id: string, value: string): Uint8Array {
  const document = new Y.Doc();
  document.getMap("shapes").set(id, value);
  const update = Y.encodeStateAsUpdate(document);
  document.destroy();
  return update;
}

/**
 * Minimal Hocuspocus client built on the `ws` package.
 * It does not use @hocuspocus/provider or a Y.Doc binding.
 */
export class RawCollabSocket {
  private readonly inbox: DecodedMessage[] = [];
  private readonly waiters: Array<(message: DecodedMessage) => void> = [];

  private constructor(private readonly ws: WebSocket) {}

  static async connect(url: string): Promise<RawCollabSocket> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (error) => reject(error));
    });
    const client = new RawCollabSocket(ws);
    ws.on("message", (data) => {
      const message = decodeMessage(toBytes(data));
      const waiter = client.waiters.shift();
      if (waiter) {
        waiter(message);
      } else {
        client.inbox.push(message);
      }
    });
    return client;
  }

  private send(bytes: Uint8Array): void {
    this.ws.send(bytes);
  }

  private next(timeoutMs = 5000): Promise<DecodedMessage> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for a WebSocket message"));
      }, timeoutMs);
      this.waiters.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  async authenticate(documentName: string, token: string): Promise<string> {
    const encoder = encoding.createEncoder();
    encoding.writeVarString(encoder, documentName);
    encoding.writeVarUint(encoder, MessageType.Auth);
    writeAuthentication(encoder, token);
    this.send(encoding.toUint8Array(encoder));

    for (;;) {
      const message = await this.next();
      if (message.messageType !== MessageType.Auth) {
        continue;
      }
      if (message.authType === AuthMessageType.PermissionDenied) {
        throw new Error(message.reason ?? "unauthorized");
      }
      if (message.scope) {
        return message.scope;
      }
    }
  }

  async sendUpdate(documentName: string, update: Uint8Array): Promise<boolean> {
    const encoder = encoding.createEncoder();
    encoding.writeVarString(encoder, documentName);
    encoding.writeVarUint(encoder, MessageType.Sync);
    writeUpdate(encoder, update);
    this.send(encoding.toUint8Array(encoder));

    for (;;) {
      const message = await this.next();
      if (message.messageType === MessageType.SyncStatus) {
        return message.saved === true;
      }
    }
  }

  close(): void {
    this.ws.close();
  }
}
