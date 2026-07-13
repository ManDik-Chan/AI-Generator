# AI-Generator V2

> Phase 6A2 已进入 Draft 验收：在 Phase 6A1 文本工具框架上增加单图图片理解、私有 `ToolAsset`、安全解码重编码、独立视觉限额和 OpenAI-compatible 多模态 Provider。当前不包含 PDF/DOCX/OCR/RAG、多图、图片生成或编辑；真实 Supabase 与视觉模型联调仍待项目所有者完成。详见 `docs/image-understanding-tool.md`。

> Phase 5A3-2 已完成真实验收：长期记忆采用确定性关键词、`topicKey` / `keywords`、512 维 Embedding 语义召回与 Hybrid RRF；未配置或运行失败时安全退回关键词召回。这不是外部文件 RAG。详见 `docs/memory-semantic-retrieval.md`。

面向亲朋好友使用的私人 AI 助手平台。V2 使用 Next.js 15、TypeScript 与 Tailwind CSS 重构，目标是简单、稳定、美观和易维护。

## 本地开发

要求 Node.js 22 LTS 与 pnpm。

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。环境变量参考 `.env.example`，真实密钥只写入 `.env.local`。

数据库与认证配置见 `docs/authentication.md`。配置 Supabase 后运行 `pnpm db:migrate`，并在 Supabase SQL Editor 执行 `prisma/rls.sql`。

## AI 聊天

Phase 3 提供 `/chat` 流式聊天、历史记录、删除、Markdown 与代码块。Provider 使用 OpenAI-compatible Chat Completions；GLM-5.2 与未来 OpenAI 均通过服务端环境变量切换，不需要改写聊天页面或 API。配置与联调步骤见 `docs/ai-provider.md` 和 `docs/chat-system.md`。

## AI 人格

Phase 4A 提供 `/personas` 私有人格管理：手动创建、编辑、预设头像、归档恢复，并可将人格绑定到新对话。人格 Prompt 只在服务端拼装，不返回浏览器；详细设计见 `docs/persona-system.md`。

Phase 4A2 在 `/personas/new` 增加可选的 AI 草稿模式：自然语言描述经现有 OpenAI-compatible Provider 转为严格结构化草稿，用户修改并确认后才使用原创建流程保存。配置和错误排查见 `docs/ai-persona-generation.md`。

## 长期记忆

Phase 5A1 在助手成功完成回复后使用一次低成本 OpenAI-compatible 模型调用，严格执行 CREATE / UPDATE / IGNORE，并通过 Next.js `after` 在响应结束后运行。用户仍可编辑、停用、删除，手动添加仅作为高级补救入口。

Phase 5A3-2 使用通用 OpenAI-compatible Embedding Provider 和独立 `MemoryEmbedding` 表，为 Memory 内容建立固定 512 维索引。默认 `adaptive` 模式只在关键词结果不足、无直接匹配或出现记忆意图时生成一次 query embedding，再以稳定 RRF 融合确定性与语义排名。没有配置 Key、pgvector 不可用或 Provider 失败时聊天继续使用原确定性召回。当前不包含文件、网页、Message 向量化或外部知识库 RAG。

真实 Supabase migration/vector extension、Embedding-3 回填、不同表达语义召回、Memory 更新后向量重建、隔离、Cascade 和安全降级均已通过项目所有者验收。没有自动删除或自动批量合并，Phase 6 未开始。

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

架构、迁移、数据库与部署决策见 `docs/`。旧 Streamlit 原型保存在 `legacy/streamlit/`，仅供迁移参考。
