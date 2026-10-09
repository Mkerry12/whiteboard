# Database schema

PostgreSQL stores accounts, whiteboard metadata, share links, and the opaque Yjs document. The server applies `apps/server/drizzle/0000_init.sql` on startup. Shape contents live only inside `whiteboards.yjs_state`; the server does not parse them.

## users

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `email` | `text` | Unique, stored lowercase |
| `password_hash` | `text` | `scrypt$<salt hex>$<hash hex>` |
| `name` | `text` | Display name |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

## whiteboards

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `owner_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `title` | `text` | 1–200 characters after trim |
| `yjs_state` | `bytea` null | Latest Yjs snapshot (`Y.encodeStateAsUpdate`). Null until the first debounced store. |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Bumped on rename and on each snapshot store |

Indexes: `whiteboards_owner_id_idx`, `whiteboards_updated_at_idx`.

The collaboration document name is `whiteboard:<id>`. Restarting the process loads this column through the Hocuspocus database extension, so content survives a server restart.

## share_links

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `board_id` | `uuid` FK → `whiteboards.id` | `ON DELETE CASCADE` |
| `token` | `text` | Unique, 32-byte base64url, stored in plaintext so the owner can list and copy it again |
| `role` | `text` | `editor` or `viewer` |
| `created_by` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `revoked_at` | `timestamptz` null | Set on revoke. The row is kept. |
| `created_at` | `timestamptz` | Default `now()` |

Check: `role in ('editor', 'viewer')`. Indexes: unique `token`, `board_id`.

## board_members

A membership is created when a signed-in user redeems a share link. The owner is not inserted here; ownership comes from `whiteboards.owner_id`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `board_id` | `uuid` FK → `whiteboards.id` | `ON DELETE CASCADE` |
| `user_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `role` | `text` | `editor` or `viewer`, copied from the link at redeem time |
| `share_link_id` | `uuid` FK → `share_links.id` | `ON DELETE CASCADE`. Access requires this link's `revoked_at` to be null. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Updated when the same user redeems again |

Unique `(board_id, user_id)`. Redeeming a second link for the same board updates `role` and `share_link_id`.

## Access rules

- **owner**: `whiteboards.owner_id`. Can read and write the Yjs document, rename, delete, and manage share links.
- **editor**: active membership or an active share token. Can read and write the Yjs document. Cannot manage the board.
- **viewer**: same sources as editor. The handshake sets the Hocuspocus connection read-only. Yjs updates from that socket are ignored.
- A revoked link rejects both the raw token and every membership that points at it.
- Callers who cannot see a board get `404`, including strangers. A visible non-owner who tries to manage it gets `403`.
