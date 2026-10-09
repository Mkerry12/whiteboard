# @whiteboard/web

Vue 3 whiteboard editor: Konva canvas, Yjs shape map, Hocuspocus sync, Pinia, and Vue Router.

The package lives in the pnpm workspace. Install from the repository root so `pnpm-lock.yaml` stays the single lockfile.

## Run the two-window demo

```bash
pnpm install
pnpm --filter @whiteboard/web sync-server
pnpm --filter @whiteboard/web dev
```

Open http://localhost:5173 in two browser windows.

1. Register a name and password (at least 4 characters). The mock API is on by default.
2. Create a board and open it.
3. Draw in both windows. Shapes, colors, and z-order meet on the same document. Each window shows the other person's cursor and name.
4. Close one window. That cursor disappears.
5. Refresh either window while the sync server is still running. The drawing comes back. Documents are stored as files in `apps/web/dev/.data/` (gitignored). The server writes about 150ms after a change, and immediately when the last client disconnects.

The dev sync server does not check tokens. Read-only is enforced in the UI. A real Hocuspocus backend can also mark the connection `readonly`; the same provider path honors that.

## Login, boards, and sharing

- `/login` registers or signs in. A session is kept in `localStorage`.
- `/boards` lists your boards: create, rename, delete.
- Share opens an edit link and a view-only link (`/boards/:id?share=TOKEN`).
- A view-only link hides the drawing rail. Pan and zoom stay available.
- Opening `/boards/:id` while logged out redirects to `/login?redirect=...`, including share links. After login the app returns and redeems the share token.

## Drawing

Tools: select (V), pan (H), pen (P), rectangle (R), ellipse (O), line (L), arrow (A), text (T), sticky note (N).

Also: drag to move, Konva Transformer handles to resize, Delete to remove, `]` / `[` to change stacking order, color and stroke width, wheel or `+` / `-` to zoom, `0` to reset the view, Space or the pan tool to drag the canvas. Double-click text or a sticky note to edit. Empty text deletes the shape.

Shapes are a `Y.Map` keyed by id. Each shape is a `Y.Map` with `type`, nested geometry, nested style, and a fractional-index `zIndex`. Pen points are a `Y.Array`.

## 2000 shapes

In a dev build the editor shows **Seed 2000**. You can also open `?seed=2000` (capped at 5000). Seeding waits until the document has synced.

While panning, the shape layer stops listening for hits and is cached as one bitmap, then the cache is cleared when the drag ends. After a pan longer than a quarter second the canvas shows `Pan N fps` for about four seconds.

## Environment

Copy `apps/web/.env.example` if you want to override the defaults. The app runs without that file.

| Variable        | Default                 | Purpose                                |
| --------------- | ----------------------- | -------------------------------------- |
| `VITE_USE_MOCK` | mock unless `false`     | In-memory boards API in `localStorage` |
| `VITE_SYNC_URL` | `ws://localhost:1234`   | Hocuspocus WebSocket                   |
| `VITE_API_URL`  | `http://localhost:3000` | HTTP API when the mock is off          |

`SYNC_PORT` (1234) and `SYNC_HOST` (`0.0.0.0`) configure the dev sync server only.

With `VITE_USE_MOCK=false` the HTTP client calls the contract in `src/api/types.ts`. Sync still uses `HocuspocusProvider` with the board id as the document name and the session or share token.

## Checks

```bash
pnpm --filter @whiteboard/web lint
pnpm --filter @whiteboard/web typecheck
pnpm --filter @whiteboard/web test
pnpm --filter @whiteboard/web build
```

## Later (not in this PR)

`useCollabSession` leaves room for `y-indexeddb`, `Y.UndoManager` on the local origin, and `exportStagePng`.
