import type { BoardParticipant } from "@whiteboard/shared";

export interface PresenceUser extends BoardParticipant {
  color: string;
}

export interface Peer {
  clientId: number;
  user: PresenceUser;
  cursor: { x: number; y: number } | null;
}

export interface RemoteCursor {
  clientId: number;
  displayName: string;
  color: string;
  x: number;
  y: number;
}

export function readPeers(
  states: ReadonlyMap<number, Record<string, unknown>>,
  localClientId: number,
): Peer[] {
  const peers: Peer[] = [];
  states.forEach((state, clientId) => {
    if (clientId === localClientId) return;
    const user = readUser(state.user);
    if (!user) return;
    peers.push({
      clientId,
      user,
      cursor: readCursor(state.cursor),
    });
  });
  peers.sort((a, b) => a.clientId - b.clientId);
  return peers;
}

export function cursorsFromPeers(peers: readonly Peer[]): RemoteCursor[] {
  const cursors: RemoteCursor[] = [];
  for (const peer of peers) {
    if (!peer.cursor) continue;
    cursors.push({
      clientId: peer.clientId,
      displayName: peer.user.displayName,
      color: peer.user.color,
      x: peer.cursor.x,
      y: peer.cursor.y,
    });
  }
  return cursors;
}

function readUser(value: unknown): PresenceUser | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  if (
    typeof record.displayName !== "string" ||
    record.displayName.length === 0
  ) {
    return null;
  }
  if (typeof record.color !== "string" || record.color.length === 0)
    return null;
  return {
    id: record.id,
    displayName: record.displayName,
    color: record.color,
  };
}

function readCursor(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.x !== "number" || typeof record.y !== "number") return null;
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return null;
  return { x: record.x, y: record.y };
}
