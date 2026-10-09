export const COLLABORATION_PATH = "/collaboration";
export const DOCUMENT_NAME_PREFIX = "whiteboard:";
export const JWT_TOKEN_PREFIX = "jwt:";
export const SHARE_TOKEN_PREFIX = "share:";

const BOARD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function documentNameForBoard(boardId: string): string {
  return `${DOCUMENT_NAME_PREFIX}${boardId}`;
}

export function boardIdFromDocumentName(documentName: string): string | null {
  if (!documentName.startsWith(DOCUMENT_NAME_PREFIX)) {
    return null;
  }
  const boardId = documentName.slice(DOCUMENT_NAME_PREFIX.length);
  return BOARD_ID.test(boardId) ? boardId.toLowerCase() : null;
}

export function formatJwtCollabToken(accessToken: string): string {
  return `${JWT_TOKEN_PREFIX}${accessToken}`;
}

export function formatShareCollabToken(shareToken: string): string {
  return `${SHARE_TOKEN_PREFIX}${shareToken}`;
}
