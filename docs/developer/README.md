# AI-Generator 开发者文档

这里是网站 `/docs` 下全部开发者文档的源文件。网站在构建时直接读取这些 Markdown，仓库与网站的内容始终一致。

| 文档 | 网站路径 | 内容 |
| --- | --- | --- |
| [开发者手册](guide.md) | `/docs/guide` | 环境、初始化、最小接入示例、两种能力的实现方式、调试、排错、安全、发布 |
| [API Reference](api-reference.md) | `/docs/api` | 接口状态、约定、运行生命周期、数据结构、端点、SSE、错误码、安全边界、版本规则 |
| [Manifest 与能力描述符](manifest.md) | `/docs/manifest` | P0.5 Manifest 字段与校验、`aig.capability/0.1` |
| [接口清单](interface-status.md) | `/docs/status` | 已实现 / Demo 专用 / 设计契约，以及下一阶段的接入点 |
| [openapi.json](openapi.json) | `/api/demo/v1/openapi.json` | Demo Runtime API 的 OpenAPI 3.1 规范（由代码生成） |
| [contracts/manifest.schema.json](contracts/manifest.schema.json) | — | P0.5 Manifest JSON Schema 副本（设计契约） |

## 维护规则

- 文档中带 `<!-- example: 路径 -->` 标记的代码块来自 `examples/` 下的文件，这些文件都由 `examples/examples.test.ts` 执行。修改示例后运行 `pnpm docs:sync`。
- `openapi.json` 由 `features/demos/runtime/openapi.ts` 从 zod 契约生成，不要手改；改契约后运行 `pnpm docs:sync`。
- `features/docs/docs.test.ts` 检查：示例与文件一致、站内链接与锚点存在、Manifest Schema 副本与校验器一致、Demo 目录与能力描述符一致。
- `<!-- widget: 名称 -->` 标记在网站上替换为交互组件（在线请求、Manifest 校验器），在 GitHub 上不可见。
- `contracts/manifest.schema.json` 复制自 `codex/platform-p05-convergence-20261028` 分支 `b7d1e1f` 的 `docs/platform/p05/contracts/manifest.schema.json`（SHA-256 `ce140b09…6f7386c`），P0.5 契约合并到 main 后应改为引用原文件。
