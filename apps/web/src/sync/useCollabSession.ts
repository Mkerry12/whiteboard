import { HocuspocusProvider, type WebSocketStatus } from "@hocuspocus/provider";
import { onScopeDispose, ref, type Ref } from "vue";
import * as Y from "yjs";
import {
  cursorsFromPeers,
  readPeers,
  type Peer,
  type RemoteCursor,
} from "./peers";
import type { PresenceUser } from "./peers";
import { ShapeStore } from "./shapeStore";
import type { ShapeSnapshot } from "./types";

export type SyncStatus = "connecting" | "connected" | "disconnected";

export interface CollabSession {
  shapes: Ref<ShapeSnapshot[]>;
  status: Ref<SyncStatus>;
  synced: Ref<boolean>;
  peers: Ref<Peer[]>;
  cursors: Ref<RemoteCursor[]>;
  serverReadOnly: Ref<boolean>;
  store: ShapeStore;
  setCursor: (point: { x: number; y: number } | null) => void;
}

/**
 * P1 seams, intentionally not wired:
 * - Offline cache: `new IndexeddbPersistence(documentName, doc)` from y-indexeddb
 *   before the provider connects, so local edits replay after reconnect.
 * - Undo: `new Y.UndoManager(store.shapes, { trackedOrigins: new Set([LOCAL_ORIGIN]) })`.
 * - PNG export: `exportStagePng` in src/canvas/exportPng.ts.
 */
export function useCollabSession(options: {
  url: string;
  documentName: string;
  token: string;
  user: PresenceUser;
}): CollabSession {
  const doc = new Y.Doc();
  const store = new ShapeStore(doc);
  const shapes = ref<ShapeSnapshot[]>(store.list());
  const status = ref<SyncStatus>("connecting");
  const synced = ref(false);
  const peers = ref<Peer[]>([]);
  const cursors = ref<RemoteCursor[]>([]);
  const serverReadOnly = ref(false);

  const provider = new HocuspocusProvider({
    url: options.url,
    name: options.documentName,
    token: options.token,
    document: doc,
    onStatus({ status: next }: { status: WebSocketStatus }) {
      status.value = next;
    },
    onAuthenticated({ scope }) {
      serverReadOnly.value = scope === "readonly";
    },
    onSynced({ state }) {
      synced.value = state;
    },
  });

  provider.setAwarenessField("user", {
    id: options.user.id,
    displayName: options.user.displayName,
    color: options.user.color,
  });

  const stop = store.subscribe(() => {
    shapes.value = store.list();
  });

  const refreshPeers = () => {
    const awareness = provider.awareness;
    if (!awareness) {
      peers.value = [];
      cursors.value = [];
      return;
    }
    const next = readPeers(
      awareness.getStates() as Map<number, Record<string, unknown>>,
      awareness.clientID,
    );
    peers.value = next;
    cursors.value = cursorsFromPeers(next);
  };

  provider.awareness?.on("change", refreshPeers);
  refreshPeers();

  function setCursor(point: { x: number; y: number } | null): void {
    provider.setAwarenessField("cursor", point);
  }

  onScopeDispose(() => {
    stop();
    try {
      provider.setAwarenessField("cursor", null);
    } catch {
      // The socket may already be closed.
    }
    provider.destroy();
    doc.destroy();
  });

  return {
    shapes,
    status,
    synced,
    peers,
    cursors,
    serverReadOnly,
    store,
    setCursor,
  };
}
