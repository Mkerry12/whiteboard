# 协同白板

实时协同白板 MVP 的 pnpm monorepo。当前提交只包含仓库脚手架和共享类型，`apps/web` 与 `apps/server` 由各自负责人在后续 PR 中初始化。

## 目录

- `apps/web`（前端）：Vue 3 + Vite + TypeScript，画布使用 Konva，协同使用 Yjs
- `apps/server`（后端）：Node.js + TypeScript，HTTP API 与 Hocuspocus（Yjs）WebSocket，PostgreSQL 存储，Redis 跨实例广播
- `packages/shared`（共享）：前后端共用的 TypeScript 类型，包名为 `@whiteboard/shared`

应用的 `tsconfig.json` 应 `extends` 根目录的 `tsconfig.base.json`。ESLint（扁平配置，含 TypeScript 与 Vue）和 Prettier 配置在仓库根目录，在子目录执行时会向上找到。

## 环境

- Node.js 20.19 或更高。`.nvmrc` 写的是 `20`，安装的是当前 Node 20；ESLint 10 需要 20.19 以上
- pnpm `10.33.4`，见根目录 `package.json` 的 `packageManager`
- Docker Compose v2，仅用于启动本地数据库

```bash
corepack enable
pnpm install
```

## 本地数据库

```bash
docker compose -f docker-compose.dev.yml up -d
```

PostgreSQL 16 映射到 `localhost:5432`，Redis 7 映射到 `localhost:6379`。数据放在命名卷里，并带有健康检查。

复制环境变量示例后再改本机配置：

```bash
cp .env.example .env
```

示例里的 `DATABASE_URL`、`REDIS_URL`、`JWT_SECRET` 都是本地占位。数据库默认用户、密码和库名是 `postgres` / `postgres` / `whiteboard`。

停止容器并保留数据：

```bash
docker compose -f docker-compose.dev.yml down
```

## 常用命令

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format
```

这些命令通过 `pnpm -r --if-present` 在各个 workspace 包中执行同名脚本。还没有该脚本的包会被跳过。

在应用里依赖共享类型：

```json
{
  "dependencies": {
    "@whiteboard/shared": "workspace:*"
  }
}
```

## 拉取请求约定

一个 PR 只负责一个应用：前端 PR 改 `apps/web`，后端 PR 改 `apps/server`。共享类型放在 `packages/shared`。

应用新增依赖时会更新根目录的 `pnpm-lock.yaml`。除此之外，功能 PR 保持在自己的应用目录内，把 workspace、CI、ESLint、Prettier 和 Compose 的修改留在单独的脚手架 PR，这样两条线可以并行。
