# AI-Generator V2

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
```

架构、迁移、数据库与部署决策见 `docs/`。旧 Streamlit 原型保存在 `legacy/streamlit/`，仅供迁移参考。
