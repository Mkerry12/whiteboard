# apps/server

后端服务，由后端负责人在本目录内初始化。

约定技术栈：Node.js、TypeScript、HTTP API、Hocuspocus（Yjs WebSocket）、PostgreSQL、Redis。

`tsconfig.json` 请 `extends` 仓库根目录的 `tsconfig.base.json`。Lint 与格式化沿用根目录的 ESLint 和 Prettier。本地数据库用仓库根目录的 `docker-compose.dev.yml`。后续功能 PR 只修改 `apps/server`。
