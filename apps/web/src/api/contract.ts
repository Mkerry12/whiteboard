/** WebSocket names from docs/backend/api.md. */

export const DOCUMENT_NAME_PREFIX = "whiteboard:";
export const JWT_TOKEN_PREFIX = "jwt:";
export const SHARE_TOKEN_PREFIX = "share:";

export function collaborationDocumentName(boardId: string): string {
  return `${DOCUMENT_NAME_PREFIX}${boardId}`;
}

export function collaborationToken(
  kind: "jwt" | "share",
  token: string,
): string {
  const prefix = kind === "jwt" ? JWT_TOKEN_PREFIX : SHARE_TOKEN_PREFIX;
  return token.startsWith(prefix) ? token : `${prefix}${token}`;
}

/** Editor route the share dialog copies. The API does not return this path. */
export function shareLinkPath(link: {
  boardId: string;
  token: string;
}): string {
  return `/boards/${encodeURIComponent(link.boardId)}?share=${encodeURIComponent(link.token)}`;
}
