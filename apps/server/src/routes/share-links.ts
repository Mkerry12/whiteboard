import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppDb } from "../db/client.js";
import {
  boardMembers,
  shareLinks,
  shareRoles,
  whiteboards,
} from "../db/schema.js";
import { ErrorCode, HttpError } from "../errors.js";
import { requireOwner, requireUser } from "../http/principal.js";
import { serializeShareLink, serializeWhiteboard } from "../http/presenter.js";
import { parseInput } from "../http/validate.js";
import { getUserBoardAccess } from "../services/access.js";

const boardParamsSchema = z.object({
  boardId: z.uuid(),
});

const linkParamsSchema = boardParamsSchema.extend({
  linkId: z.uuid(),
});

const createLinkSchema = z.object({
  role: z.enum(shareRoles),
});

const redeemSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

const tokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function registerShareLinkRoutes(
  app: FastifyInstance,
  deps: { db: AppDb; jwtSecret: string },
): void {
  app.post(
    "/api/v1/whiteboards/:boardId/share-links",
    async (request, reply) => {
      const params = parseInput(boardParamsSchema, request.params);
      const body = parseInput(createLinkSchema, request.body);
      const access = await requireOwner(
        request,
        deps.db,
        deps.jwtSecret,
        params.boardId,
      );
      const inserted = await deps.db
        .insert(shareLinks)
        .values({
          boardId: access.board.id,
          token: newShareToken(),
          role: body.role,
          createdBy: access.owner.id,
        })
        .returning();
      const link = inserted[0];
      if (!link) {
        throw new HttpError(
          500,
          ErrorCode.INTERNAL_ERROR,
          "Could not create the share link",
        );
      }
      return reply.status(201).send({ shareLink: serializeShareLink(link) });
    },
  );

  app.get("/api/v1/whiteboards/:boardId/share-links", async (request) => {
    const params = parseInput(boardParamsSchema, request.params);
    const access = await requireOwner(
      request,
      deps.db,
      deps.jwtSecret,
      params.boardId,
    );
    const links = await deps.db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.boardId, access.board.id))
      .orderBy(desc(shareLinks.createdAt));
    return { shareLinks: links.map(serializeShareLink) };
  });

  app.delete(
    "/api/v1/whiteboards/:boardId/share-links/:linkId",
    async (request) => {
      const params = parseInput(linkParamsSchema, request.params);
      await requireOwner(request, deps.db, deps.jwtSecret, params.boardId);
      const existing = await deps.db
        .select()
        .from(shareLinks)
        .where(
          and(
            eq(shareLinks.id, params.linkId),
            eq(shareLinks.boardId, params.boardId),
          ),
        )
        .limit(1);
      const link = existing[0];
      if (!link) {
        throw new HttpError(404, ErrorCode.NOT_FOUND, "Share link not found");
      }
      if (link.revokedAt) {
        return { shareLink: serializeShareLink(link) };
      }
      const updated = await deps.db
        .update(shareLinks)
        .set({ revokedAt: new Date() })
        .where(eq(shareLinks.id, link.id))
        .returning();
      const revoked = updated[0];
      if (!revoked) {
        throw new HttpError(404, ErrorCode.NOT_FOUND, "Share link not found");
      }
      return { shareLink: serializeShareLink(revoked) };
    },
  );

  app.get("/api/v1/share-links/:token", async (request) => {
    const params = parseInput(tokenParamsSchema, request.params);
    const found = await findActiveShare(deps.db, params.token);
    if (!found) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, "Share link not found");
    }
    return {
      shareLink: {
        boardId: found.link.boardId,
        boardTitle: found.title,
        role: found.link.role,
      },
    };
  });

  app.post("/api/v1/share-links/redeem", async (request) => {
    const user = await requireUser(request, deps.db, deps.jwtSecret);
    const body = parseInput(redeemSchema, request.body);
    const found = await findActiveShare(deps.db, body.token);
    if (!found) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, "Share link not found");
    }

    if (
      found.link.boardId &&
      (await isOwner(deps.db, user.id, found.link.boardId))
    ) {
      const access = await getUserBoardAccess(
        deps.db,
        user.id,
        found.link.boardId,
      );
      if (!access) {
        throw new HttpError(404, ErrorCode.NOT_FOUND, "Whiteboard not found");
      }
      return { whiteboard: serializeWhiteboard(access) };
    }

    await deps.db
      .insert(boardMembers)
      .values({
        boardId: found.link.boardId,
        userId: user.id,
        role: found.link.role,
        shareLinkId: found.link.id,
      })
      .onConflictDoUpdate({
        target: [boardMembers.boardId, boardMembers.userId],
        set: {
          role: found.link.role,
          shareLinkId: found.link.id,
          updatedAt: new Date(),
        },
      });

    const access = await getUserBoardAccess(
      deps.db,
      user.id,
      found.link.boardId,
    );
    if (!access) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, "Whiteboard not found");
    }
    return { whiteboard: serializeWhiteboard(access) };
  });
}

async function findActiveShare(db: AppDb, token: string) {
  const rows = await db
    .select({
      link: shareLinks,
      title: whiteboards.title,
      ownerId: whiteboards.ownerId,
    })
    .from(shareLinks)
    .innerJoin(whiteboards, eq(shareLinks.boardId, whiteboards.id))
    .where(eq(shareLinks.token, token))
    .limit(1);
  const row = rows[0];
  if (!row || row.link.revokedAt) {
    return null;
  }
  return row;
}

async function isOwner(
  db: AppDb,
  userId: string,
  boardId: string,
): Promise<boolean> {
  const rows = await db
    .select({ ownerId: whiteboards.ownerId })
    .from(whiteboards)
    .where(eq(whiteboards.id, boardId))
    .limit(1);
  return rows[0]?.ownerId === userId;
}
