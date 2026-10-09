import { eq } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppDb } from "../db/client.js";
import { whiteboards } from "../db/schema.js";
import { ErrorCode, HttpError } from "../errors.js";
import {
  requireBoardAccess,
  requireOwner,
  requireUser,
} from "../http/principal.js";
import { serializeWhiteboard } from "../http/presenter.js";
import { parseInput } from "../http/validate.js";
import { listBoardsForUser } from "../services/access.js";

const titleSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const boardParamsSchema = z.object({
  boardId: z.uuid(),
});

export function registerWhiteboardRoutes(
  app: FastifyInstance,
  deps: { db: AppDb; jwtSecret: string },
): void {
  app.post("/api/v1/whiteboards", async (request, reply) => {
    const user = await requireUser(request, deps.db, deps.jwtSecret);
    const body = parseInput(titleSchema, request.body);
    const inserted = await deps.db
      .insert(whiteboards)
      .values({
        ownerId: user.id,
        title: body.title,
      })
      .returning();
    const board = inserted[0];
    if (!board) {
      throw new HttpError(
        500,
        ErrorCode.INTERNAL_ERROR,
        "Could not create the whiteboard",
      );
    }
    return reply.status(201).send({
      whiteboard: serializeWhiteboard({
        board,
        role: "owner",
        owner: { id: user.id, name: user.name },
      }),
    });
  });

  app.get("/api/v1/whiteboards", async (request) => {
    const user = await requireUser(request, deps.db, deps.jwtSecret);
    const boards = await listBoardsForUser(deps.db, user.id);
    return { whiteboards: boards.map(serializeWhiteboard) };
  });

  app.get("/api/v1/whiteboards/:boardId", async (request) => {
    const params = parseInput(boardParamsSchema, request.params);
    const access = await requireBoardAccess(
      request,
      deps.db,
      deps.jwtSecret,
      params.boardId,
    );
    return { whiteboard: serializeWhiteboard(access) };
  });

  app.patch("/api/v1/whiteboards/:boardId", async (request) => {
    const params = parseInput(boardParamsSchema, request.params);
    const body = parseInput(titleSchema, request.body);
    const access = await requireOwner(
      request,
      deps.db,
      deps.jwtSecret,
      params.boardId,
    );
    const updated = await deps.db
      .update(whiteboards)
      .set({ title: body.title, updatedAt: new Date() })
      .where(eq(whiteboards.id, access.board.id))
      .returning();
    const board = updated[0];
    if (!board) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, "Whiteboard not found");
    }
    return {
      whiteboard: serializeWhiteboard({
        board,
        role: "owner",
        owner: access.owner,
      }),
    };
  });

  app.delete("/api/v1/whiteboards/:boardId", async (request, reply) => {
    const params = parseInput(boardParamsSchema, request.params);
    const access = await requireOwner(
      request,
      deps.db,
      deps.jwtSecret,
      params.boardId,
    );
    await deps.db
      .delete(whiteboards)
      .where(eq(whiteboards.id, access.board.id));
    return reply.status(204).send();
  });
}
