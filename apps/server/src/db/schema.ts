import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Yjs document state is opaque binary. Callers pass Uint8Array; drivers may
 * hand back a Buffer or a hex/base64 string.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) {
      return new Uint8Array(value);
    }
    if (typeof value === "string") {
      const hex = value.startsWith("\\x") ? value.slice(2) : value;
      return new Uint8Array(Buffer.from(hex, "hex"));
    }
    throw new Error("Unsupported bytea driver value");
  },
});

export const shareRoles = ["editor", "viewer"] as const;
export type ShareRole = (typeof shareRoles)[number];
export type BoardRole = "owner" | ShareRole;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const whiteboards = pgTable(
  "whiteboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    yjsState: bytea("yjs_state"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("whiteboards_owner_id_idx").on(table.ownerId),
    index("whiteboards_updated_at_idx").on(table.updatedAt),
  ],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => whiteboards.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    role: text("role", { enum: shareRoles }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("share_links_token_unique").on(table.token),
    index("share_links_board_id_idx").on(table.boardId),
    check("share_links_role_check", sql`${table.role} in ('editor', 'viewer')`),
  ],
);

export const boardMembers = pgTable(
  "board_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => whiteboards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: shareRoles }).notNull(),
    shareLinkId: uuid("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("board_members_board_user_unique").on(
      table.boardId,
      table.userId,
    ),
    index("board_members_user_id_idx").on(table.userId),
    index("board_members_share_link_id_idx").on(table.shareLinkId),
    check(
      "board_members_role_check",
      sql`${table.role} in ('editor', 'viewer')`,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type WhiteboardRow = typeof whiteboards.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;
export type BoardMemberRow = typeof boardMembers.$inferSelect;
