# AI-Generator V2

> Phase 6B3 — Lumen 全站前端集成与应用基础架构审计已由项目所有者真实验收通过：Lumen 视觉、完整桌面/移动导航、真实数据表面、账户隐私、管理员控制台与 Chat-only VisualViewport 均已接入既有业务。详见 `docs/lumen-integration-map.md`、`docs/application-foundation-audit.md` 与 `docs/mobile-experience.md`。

> Phase 7A1 多 Agent 头脑风暴已进入 Draft：一次明确点击固定创建四个独立 Worker，并在至少两个成功后调用一次协调器，总模型调用最多五次。任务复用 ToolRun、waitUntil、durable cancellation 与恢复机制，不读取聊天、Persona、Memory，不联网或调用工具。当前等待项目所有者部署独立 migration/RLS 并完成真实模型、后台恢复和响应式验收；Phase 7A2 Vibe Coding 尚未开始。详见 `docs/multi-agent-brainstorm.md`。

> Phase 7A1.1 — Chat Agent Mode + Codex 风格 Worker 编排底座为 Draft：Chat 可针对当前一次发送选择标准 4 Worker 或深度 6 Worker，服务端完成 Planner、DAG、隔离 Worker Pool、单 Worker/全局取消、Leader、SSE、waitUntil、恢复、Credits、`/agents` 历史与最终 Assistant Message 持久化。当前 Worker 只有 `REASONING`，没有搜索、文件、代码执行、Shell、Git、Browser 或 MCP。Phase 7A1.2 与 Phase 7A2 均未开始。详见 `docs/agent-mode.md`、`docs/worker-orchestration.md`、`docs/agent-threat-model.md` 与 `docs/agent-data-model.md`。

正式域名为 <https://www.ai-mdc.com>。

> Phase 6A3 通用 AI 图片生成工作台已完成项目所有者真实验收：单图文生图、private `generated-images`、停止与 durable recovery、移动后台继续、Prompt/Storage 隔离和响应式均已通过。当前不包含图片编辑、多图、视频、OCR 或 RAG。详见 `docs/image-generation-tool.md`。

> Phase 6B1 已按项目所有者批准的 Premium 高保真原型扩展为全产品 UI 迁移：纸张/深炭主题、翡翠强调、双星品牌、响应式应用外壳，以及首页、认证、聊天、人格、长期记忆、文本工具、图片分析、工具历史、账号和管理页面均已统一。所有页面只展示真实数据或诚实空状态；原型中的假数据和未实现功能没有进入生产。此次仅调整界面与交互呈现，不改变业务语义、API、Provider、数据库结构、RLS 或 migration，当前等待项目所有者第三轮真实视觉验收。详见 `docs/design-system.md`、`docs/ui-redesign-roadmap.md` 与 `docs/full-product-ui-redesign.md`。

> Phase 6A2 已完成项目所有者真实验收：单图图片理解、私有 `ToolAsset`、服务端安全净化、private Storage、独立视觉限额、OpenAI-compatible 多模态 Provider、SSE/停止/历史/到期清理、图片 Prompt 注入隔离和响应式均已通过。当前仍不包含 PDF/DOCX、专业 OCR、RAG、多图、视频、图片生成或编辑；Phase 6A3 与 Phase 7 尚未开始。详见 `docs/image-understanding-tool.md`。

> Phase 5A3-2 已完成真实验收：长期记忆采用确定性关键词、`topicKey` / `keywords`、512 维 Embedding 语义召回与 Hybrid RRF；未配置或运行失败时安全退回关键词召回。这不是外部文件 RAG。详见 `docs/memory-semantic-retrieval.md`。

面向亲朋好友使用的私人 AI 助手平台。V2 使用 Next.js 15、TypeScript 与 Tailwind CSS 重构，目标是简单、稳定、美观和易维护。

## 本地开发

规范开发运行时为 Node.js 22.x LTS 与 pnpm 11.7.0；仓库同时在 Node.js 24.x 执行兼容性门禁，直到 Vercel Project Settings 已人工切回 22.x。建议使用仓库的 `.nvmrc`，不要依赖系统默认 Node 版本。

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。环境变量参考 `.env.example`，真实密钥只写入 `.env.local`。

数据库与认证配置见 `docs/authentication.md`。RLS、grants、trigger 与约束必须随版本化 Prisma migration 部署；`prisma/rls.sql` 只用于灾难恢复基准，不能作为正常发布步骤。

## AI 聊天

Phase 3 提供 `/chat` 流式聊天、历史记录、删除、Markdown 与代码块。Provider 使用 OpenAI-compatible Chat Completions；GLM-5.2 与未来 OpenAI 均通过服务端环境变量切换，不需要改写聊天页面或 API。配置与联调步骤见 `docs/ai-provider.md` 和 `docs/chat-system.md`。

## AI 人格

Phase 4A 提供 `/personas` 私有人格管理：手动创建、编辑、预设头像、归档恢复，并可将人格绑定到新对话。人格 Prompt 只在服务端拼装，不返回浏览器；详细设计见 `docs/persona-system.md`。

Phase 4A2 在 `/personas/new` 增加可选的 AI 草稿模式：自然语言描述经现有 OpenAI-compatible Provider 转为严格结构化草稿，用户修改并确认后才使用原创建流程保存。配置和错误排查见 `docs/ai-persona-generation.md`。

## 长期记忆

Phase 5A1 在助手成功完成回复后使用一次低成本 OpenAI-compatible 模型调用，严格执行 CREATE / UPDATE / IGNORE，并通过 Next.js `after` 在响应结束后运行。用户仍可编辑、停用、删除，手动添加仅作为高级补救入口。

Phase 5A3-2 使用通用 OpenAI-compatible Embedding Provider 和独立 `MemoryEmbedding` 表，为 Memory 内容建立固定 512 维索引。默认 `adaptive` 模式只在关键词结果不足、无直接匹配或出现记忆意图时生成一次 query embedding，再以稳定 RRF 融合确定性与语义排名。没有配置 Key、pgvector 不可用或 Provider 失败时聊天继续使用原确定性召回。当前不包含文件、网页、Message 向量化或外部知识库 RAG。

真实 Supabase migration/vector extension、Embedding-3 回填、不同表达语义召回、Memory 更新后向量重建、隔离、Cascade 和安全降级均已通过项目所有者验收。没有自动删除或自动批量合并。

新增 Persona migration 后，项目所有者需在真实数据库执行：

```bash
pnpm db:deploy
```

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec prisma validate
```

移动浏览器回归测试：

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

未提供登录态时会运行公开认证页面的 Chromium/WebKit 测试；受保护页面需要将真实测试账号的 Playwright storage state 路径写入本地 `PLAYWRIGHT_AUTH_STATE`，该文件不得提交。

架构、迁移、数据库与部署决策见 `docs/`。旧 Streamlit 原型保存在 `legacy/streamlit/`，仅供迁移参考。
