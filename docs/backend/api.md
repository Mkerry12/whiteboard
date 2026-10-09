# HTTP and collaboration API

Base URL for local development: `http://localhost:3000`.

JSON errors use this envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "email", "message": "Invalid email" }]
  }
}
```

`details` is omitted when there is nothing extra to report.

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body, query, or path failed validation |
| 401 | `UNAUTHORIZED` | Missing, expired, or wrong credentials, or a share token was sent to a user-only route |
| 403 | `FORBIDDEN` | The caller can see the board but is not the owner |
| 404 | `NOT_FOUND` | Unknown route, or the caller cannot see the board or link |
| 409 | `CONFLICT` | Email is already registered |
| 500 | `INTERNAL_ERROR` | Unexpected failure. The message is always `Internal server error`. |

Timestamps are ISO-8601 strings.

## Authentication

Access tokens are HS256 JWTs. Claims: `iss=whiteboard`, `aud=whiteboard-api`, `sub=<user id>`, `iat`, `exp`. Default lifetime is 7 days (`JWT_EXPIRES_IN`).

User routes:

```http
Authorization: Bearer <accessToken>
```

A share token can read one board and open the collaboration socket. It cannot register, log in, list boards, or manage links:

```http
Authorization: Share <shareToken>
```

### `POST /api/v1/auth/register`

201

```json
{
  "email": "ada@example.com",
  "password": "password123",
  "name": "Ada Lovelace"
}
```

```json
{
  "user": {
    "id": "6b1e0c3a-1d2e-4f5a-8b7c-9d0e1f2a3b4c",
    "email": "ada@example.com",
    "name": "Ada Lovelace",
    "createdAt": "2026-10-09T00:00:00.000Z"
  },
  "accessToken": "<jwt>"
}
```

Email is trimmed and lowercased. Password is 8–128 characters. Name is 1–80 characters after trim. Duplicate email is 409 `CONFLICT` with message `An account with this email already exists`.

### `POST /api/v1/auth/login`

200, same body as register without `name`. Unknown email and wrong password both return 401 `UNAUTHORIZED` with message `Invalid email or password`.

### `GET /api/v1/auth/me`

200

```json
{
  "user": {
    "id": "6b1e0c3a-1d2e-4f5a-8b7c-9d0e1f2a3b4c",
    "email": "ada@example.com",
    "name": "Ada Lovelace",
    "createdAt": "2026-10-09T00:00:00.000Z"
  }
}
```

Requires `Authorization: Bearer`.

## Whiteboards

Whiteboard JSON:

```json
{
  "id": "7c2f1d4b-2e3f-4061-9c8d-0e1f2a3b4c5d",
  "title": "Sprint board",
  "role": "owner",
  "owner": { "id": "6b1e0c3a-1d2e-4f5a-8b7c-9d0e1f2a3b4c", "name": "Ada Lovelace" },
  "createdAt": "2026-10-09T00:00:00.000Z",
  "updatedAt": "2026-10-09T00:00:00.000Z"
}
```

`role` is `owner`, `editor`, or `viewer`.

### `POST /api/v1/whiteboards`

Bearer. 201 `{ "whiteboard": { ... } }`. Body `{ "title": "Sprint board" }`. Title is trimmed, 1–200 characters.

### `GET /api/v1/whiteboards`

Bearer. 200 `{ "whiteboards": [ ... ] }`. Boards the user owns, plus boards shared with them through a membership whose share link is still active. The user's own boards are not repeated in the shared set. Ordered by `updatedAt` descending.

### `GET /api/v1/whiteboards/:boardId`

Bearer or `Authorization: Share <token>`. 200 `{ "whiteboard": { ... } }`. 404 when the board does not exist, the share token is for another board, or the link is revoked.

### `PATCH /api/v1/whiteboards/:boardId`

Owner Bearer only. Body `{ "title": "Renamed" }`. 200 `{ "whiteboard": { ... } }`. Editors, viewers, and share tokens that can see the board get 403. Everyone else gets 404.

### `DELETE /api/v1/whiteboards/:boardId`

Owner Bearer only. 204 empty body. Deletes the board, its snapshot, share links, and memberships.

## Share links

Share link JSON returned to the owner:

```json
{
  "id": "8d3a2e5c-3f40-4172-ad9e-1f2a3b4c5d6e",
  "boardId": "7c2f1d4b-2e3f-4061-9c8d-0e1f2a3b4c5d",
  "role": "viewer",
  "token": "<43-char base64url>",
  "revokedAt": null,
  "createdAt": "2026-10-09T00:00:00.000Z"
}
```

### `POST /api/v1/whiteboards/:boardId/share-links`

Owner. 201 `{ "shareLink": { ... } }`. Body `{ "role": "editor" }` or `{ "role": "viewer" }`.

### `GET /api/v1/whiteboards/:boardId/share-links`

Owner. 200 `{ "shareLinks": [ ... ] }`, newest first. Includes revoked links so the owner can see that they were revoked.

### `DELETE /api/v1/whiteboards/:boardId/share-links/:linkId`

Owner. Revokes the link by setting `revokedAt`. 200 `{ "shareLink": { ... } }`. Repeating the call is a no-op and returns the already-revoked link. Unknown link is 404.

Memberships created from that link lose HTTP and collaboration access. The membership row stays until the link or board is deleted.

### `GET /api/v1/share-links/:token`

Public preview. No `Authorization` header. 200:

```json
{
  "shareLink": {
    "boardId": "7c2f1d4b-2e3f-4061-9c8d-0e1f2a3b4c5d",
    "boardTitle": "Sprint board",
    "role": "viewer"
  }
}
```

404 when the token is unknown or revoked. This response does not include the token secret beyond the URL.

### `POST /api/v1/share-links/redeem`

Bearer. Body `{ "token": "<share token>" }`. 200 `{ "whiteboard": { ... } }` with the caller's role.

- A non-owner is upserted into `board_members` with the link's role. Redeeming again replaces the previous role and source link.
- The owner receives their existing owner access and no membership row is created.
- Unknown or revoked tokens are 404.

## Health

### `GET /health`

200 `{ "status": "ok" }`. Process is up. Does not check dependencies.

### `GET /health/ready`

200 when Postgres answers `select 1` and Redis answers `PONG`:

```json
{ "status": "ok", "checks": { "database": "ok", "redis": "ok" } }
```

503 when either check fails. A failed check is `"unavailable"`.

## WebSocket collaboration

URL: `ws://localhost:3000/collaboration` (same port as HTTP).

Use `@hocuspocus/provider` against that URL. The provider's `token` is one of:

| Token | Who | Write |
| --- | --- | --- |
| `jwt:<accessToken>` | The user identified by the JWT | Owner and editor can write. Viewer is read-only. |
| `share:<shareToken>` | Anyone holding the link | `editor` can write. `viewer` is read-only. |

Document name: `whiteboard:<board uuid>`. Any other name, a missing token, a bad JWT, a token for a different board, or a revoked link is rejected during the handshake. The close reason is `unauthorized`. No document state is sent.

After a successful handshake the server sends an authenticated scope:

- `read-write` for owner and editor
- `readonly` for viewer

Read-only is enforced on the server connection. The server ignores Yjs sync step 2 and document updates from that socket and acknowledges them with sync status `saved = false`. A client that bypasses the frontend and writes a raw update still cannot change the document. Editor and owner updates are applied and acknowledged with sync status `saved = true`. Awareness messages are still delivered for viewers.

The Yjs document is opaque. The frontend should keep shapes in a `Y.Map` named `shapes`, keyed by shape id. A fractional-index z-order field belongs inside each shape value. The server stores `Y.encodeStateAsUpdate` bytes in `whiteboards.yjs_state`.

Persistence is debounced (about 2 seconds, at most 10 seconds) while clients are connected. A new process loads the last snapshot, so content is still there after a restart. Redis pub/sub (`REDIS_URL`, key prefix `REDIS_PREFIX`, default `whiteboard`) forwards updates between instances. Both instances must have the document loaded for a live write to appear on the other one. Redis is not the durable store.

### Raw frame layout

This is what a client that does not use the provider still has to speak. Integers are lib0 varuints and strings are lib0 varstrings.

Auth request:

1. document name
2. message type `2` (Auth)
3. auth type `0` (Token) and the token string (`jwt:...` or `share:...`)

Auth response, same document name and message type `2`, then either:

- auth type `2` (Authenticated) and scope `readonly` or `read-write`
- auth type `1` (PermissionDenied) and reason `unauthorized`

Update request:

1. document name
2. message type `0` (Sync)
3. sync message type `2` (Yjs update) and the update bytes

Sync status response: message type `8`, then `1` if the update was stored in the in-memory document or `0` if it was rejected.
