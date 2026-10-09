import { and, eq, isNull, ne } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import {
  boardMembers,
  shareLinks,
  users,
  whiteboards,
  type BoardRole,
  type ShareRole,
  type UserRow,
  type WhiteboardRow,
} from "../db/schema.js";

export interface OwnerSummary {
  id: string;
  name: string;
}

export interface AccessibleBoard {
  board: WhiteboardRow;
  role: BoardRole;
  owner: OwnerSummary;
}

function asTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export async function findUserById(
  db: AppDb,
  userId: string,
): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(
  db: AppDb,
  email: string,
): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserBoardAccess(
  db: AppDb,
  userId: string,
  boardId: string,
): Promise<AccessibleBoard | null> {
  const rows = await db
    .select({
      board: whiteboards,
      ownerId: users.id,
      ownerName: users.name,
    })
    .from(whiteboards)
    .innerJoin(users, eq(whiteboards.ownerId, users.id))
    .where(eq(whiteboards.id, boardId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const owner = { id: row.ownerId, name: row.ownerName };
  if (row.board.ownerId === userId) {
    return { board: row.board, role: "owner", owner };
  }

  const members = await db
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .innerJoin(shareLinks, eq(boardMembers.shareLinkId, shareLinks.id))
    .where(
      and(
        eq(boardMembers.boardId, boardId),
        eq(boardMembers.userId, userId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);

  const member = members[0];
  if (!member) {
    return null;
  }

  return { board: row.board, role: member.role, owner };
}

export async function getShareAccess(
  db: AppDb,
  token: string,
  boardId: string,
): Promise<AccessibleBoard | null> {
  const rows = await db
    .select({
      board: whiteboards,
      role: shareLinks.role,
      ownerId: users.id,
      ownerName: users.name,
    })
    .from(shareLinks)
    .innerJoin(whiteboards, eq(shareLinks.boardId, whiteboards.id))
    .innerJoin(users, eq(whiteboards.ownerId, users.id))
    .where(
      and(
        eq(shareLinks.token, token),
        eq(whiteboards.id, boardId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    board: row.board,
    role: row.role,
    owner: { id: row.ownerId, name: row.ownerName },
  };
}

export async function listBoardsForUser(
  db: AppDb,
  userId: string,
): Promise<AccessibleBoard[]> {
  const owned = await db
    .select({
      board: whiteboards,
      ownerId: users.id,
      ownerName: users.name,
    })
    .from(whiteboards)
    .innerJoin(users, eq(whiteboards.ownerId, users.id))
    .where(eq(whiteboards.ownerId, userId));

  const shared = await db
    .select({
      board: whiteboards,
      role: boardMembers.role,
      ownerId: users.id,
      ownerName: users.name,
    })
    .from(boardMembers)
    .innerJoin(whiteboards, eq(boardMembers.boardId, whiteboards.id))
    .innerJoin(shareLinks, eq(boardMembers.shareLinkId, shareLinks.id))
    .innerJoin(users, eq(whiteboards.ownerId, users.id))
    .where(
      and(
        eq(boardMembers.userId, userId),
        isNull(shareLinks.revokedAt),
        ne(whiteboards.ownerId, userId),
      ),
    );

  const items: AccessibleBoard[] = [
    ...owned.map((row) => ({
      board: row.board,
      role: "owner" as const,
      owner: { id: row.ownerId, name: row.ownerName },
    })),
    ...shared.map((row) => ({
      board: row.board,
      role: row.role as ShareRole,
      owner: { id: row.ownerId, name: row.ownerName },
    })),
  ];

  items.sort(
    (left, right) =>
      asTime(right.board.updatedAt) - asTime(left.board.updatedAt),
  );
  return items;
}
