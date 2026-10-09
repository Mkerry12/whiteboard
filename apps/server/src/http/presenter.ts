import type { AccessibleBoard } from "../services/access.js";
import type { ShareLinkRow, UserRow } from "../db/schema.js";

export function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function serializeUser(
  user: Pick<UserRow, "id" | "email" | "name" | "createdAt">,
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: toIso(user.createdAt),
  };
}

export function serializeWhiteboard(access: AccessibleBoard) {
  return {
    id: access.board.id,
    title: access.board.title,
    role: access.role,
    owner: access.owner,
    createdAt: toIso(access.board.createdAt),
    updatedAt: toIso(access.board.updatedAt),
  };
}

export function serializeShareLink(link: ShareLinkRow) {
  return {
    id: link.id,
    boardId: link.boardId,
    role: link.role,
    token: link.token,
    revokedAt: link.revokedAt ? toIso(link.revokedAt) : null,
    createdAt: toIso(link.createdAt),
  };
}
