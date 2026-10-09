# @whiteboard/server

HTTP API and Hocuspocus collaboration server for the whiteboard. One process serves REST and the WebSocket endpoint on the same port.

## Requirements

- Node.js 20 or newer
- pnpm 10
- PostgreSQL and Redis from the repo-root `docker-compose.dev.yml`

## Local run

From the repository root:

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm install
```

Environment variables use the same names as the root `.env.example`: `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET`. Copy `apps/server/.env.example` to `apps/server/.env`. The server loads the repo-root `.env` first and then `apps/server/.env`, which overrides it.

`JWT_SECRET` must be at least 16 characters. The root placeholder `replace-me` is rejected at startup. The example value is `local-dev-secret-change-me`.

```bash
pnpm --filter @whiteboard/server dev
```

Startup applies the SQL migrations in `drizzle/`. The API listens on `http://localhost:3000` and collaboration on `ws://localhost:3000/collaboration`.

Useful checks:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

`GET /health/ready` returns 200 only when both Postgres and Redis answer.

To point the Vue app at this process, see **Run against the real backend** in the repository root README. The web dev command is:

```bash
VITE_USE_MOCK=false VITE_API_URL=http://localhost:3000 VITE_SYNC_URL=ws://localhost:3000/collaboration pnpm --filter @whiteboard/web dev
```

Run a second instance for the Redis demo by setting a distinct `PORT` and `INSTANCE_ID` (`INSTANCE_ID` must stay under 200 characters). Both processes share `REDIS_URL` and `REDIS_PREFIX`.

## Scripts

| Script                                              | What it does                         |
| --------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @whiteboard/server dev`              | Watch mode. Migrates, then listens.  |
| `pnpm --filter @whiteboard/server build`            | Compile `src/` to `dist/`            |
| `pnpm --filter @whiteboard/server start`            | Run `dist/index.js`                  |
| `pnpm --filter @whiteboard/server lint`             | ESLint                               |
| `pnpm --filter @whiteboard/server typecheck`        | `tsc` for `src/` and `test/`         |
| `pnpm --filter @whiteboard/server test`             | Unit tests. No Postgres or Redis.    |
| `pnpm --filter @whiteboard/server test:integration` | Postgres and Redis tests. See below. |
| `pnpm --filter @whiteboard/server db:migrate`       | Apply migrations and exit            |

## Tests

`pnpm test` uses an in-process PGlite database. It covers registration and login, board permissions, a viewer connection that cannot change the server document, a raw WebSocket update that bypasses the provider on a read-only socket, and a restart that reloads the Yjs snapshot from the database. CI can run this without service containers.

`pnpm --filter @whiteboard/server test:integration` is the command for a job that has PostgreSQL and Redis. It reads `DATABASE_URL` and `REDIS_URL`. When either variable is missing the file is skipped and the command exits 0. When both are set it migrates, truncates `users`, `whiteboards`, `share_links`, and `board_members`, and then:

- writes on one Hocuspocus instance and reads the same shape on a second instance through Redis, while asserting the Postgres snapshot is still empty
- stores a snapshot and loads it from a new process against the same database

Point `DATABASE_URL` at a disposable database. The truncate is unconditional.

## Contract

Request and response shapes, error codes, and the WebSocket handshake are in `docs/backend/api.md`. Tables are in `docs/backend/db-schema.md`. REST types stay in this package and in those docs so the frontend can mock them without importing a built workspace package.
