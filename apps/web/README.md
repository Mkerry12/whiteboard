# apps/web

前端应用，由前端负责人在本目录内初始化。

约定技术栈：Vue 3、Vite、TypeScript、Konva、Yjs。

`tsconfig.json` 请 `extends` 仓库根目录的 `tsconfig.base.json`（前端可以按需覆盖 `lib` 与 `moduleResolution`）。Lint 与格式化沿用根目录的 ESLint 和 Prettier。后续功能 PR 只修改 `apps/web`。
