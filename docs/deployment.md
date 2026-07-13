# 部署设计

## Phase 4A3 头像部署

在 Supabase 预先创建 private bucket `persona-avatars`（PNG/JPEG/WebP，最大 15 MB），运行 `pnpm db:deploy`，并仅在服务端配置 `AI_IMAGE_PROVIDER`、`AI_IMAGE_BASE_URL`、`AI_IMAGE_API_KEY`、`AI_IMAGE_MODEL`、`AI_IMAGE_SIZE`、`AI_IMAGE_REQUEST_TIMEOUT_MS`、`SUPABASE_SERVICE_ROLE_KEY` 和 `SUPABASE_PERSONA_AVATAR_BUCKET`。应用不会在图片请求中自动创建 bucket；Service Role Key 禁止使用 `NEXT_PUBLIC_`。

## 目标拓扑

- Web 与 Route Handlers：Vercel
- Auth 与 PostgreSQL：Supabase
- 文件/图片：首选 Supabase Storage；高流量时可切换 Cloudflare R2
- AI：服务端调用 OpenAI/DeepSeek/Claude/Gemini 等远程 API

## 环境变量

本地使用 `.env.local`，部署使用 Vercel Environment Variables。仓库只提交 `.env.example`。

```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AI_PROVIDER=
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_TEMPERATURE=0.7
AI_MAX_OUTPUT_TOKENS=4096
AI_DAILY_MESSAGE_LIMIT=50
AI_MAX_INPUT_CHARS=8000
AI_REQUEST_TIMEOUT_MS=120000
MEMORY_MAX_ITEMS=8
MEMORY_MAX_CHARS=2400
AI_MEMORY_MODEL=
AI_MEMORY_TEMPERATURE=0.1
AI_MEMORY_MAX_OUTPUT_TOKENS=1000
AI_MEMORY_REQUEST_TIMEOUT_MS=90000
AUTH_SECRET=
```

Supabase URL 与 anon key 可在客户端使用；service role、数据库连接、AI Key 和 AUTH_SECRET 只能在服务端使用。代码不得通过 `NEXT_PUBLIC_` 暴露敏感值。

AI 环境变量必须分别配置到 Vercel Preview 与 Production，禁止写入仓库。未配置 AI 时构建仍会成功，聊天页显示配置提示，`POST /api/chat` 返回友好 503，不泄露内部配置。

Phase 5A1 使用已部署的 `20260713010000_add_memory_foundation`，本次自动提取调整没有新增 migration。`prisma/rls.sql` 已在每个 policy 前执行 `drop policy if exists`，可以安全重复运行。`AI_MEMORY_MODEL` 为空时回退 `AI_MODEL`；其余变量限制后台提取的低温度、输出和超时。上线前应连续执行两次 RLS，并用两个用户验证跨用户资源均被拒绝。

开发环境首次使用自动记忆时只输出模型名、90 秒超时和是否回退主模型，不输出 Key 或 Base URL。专用模型返回 NOT_FOUND 时可回退 `AI_MODEL` 一次；RATE_LIMITED 最多等待 2 秒重试一次；AUTHENTICATION 与 TIMEOUT 不重试。后台失败日志只包含安全阶段、请求/用户/对话/来源 ID、Provider code/status 和配置模型。

HTTP 400 会作为 `INVALID_REQUEST` 记录，并可附带服务商 error code 与最多 200 字符的脱敏 message；不会回退或重试。自动记忆和 JSON Repair 都使用 system policy + 最后一条 user data 的双消息结构，避免 GLM-compatible 接口拒绝 system-only 请求。

## Vercel 流程

1. 建立 Supabase 项目并记录区域。
2. 配置 pooled `DATABASE_URL` 与迁移用 `DIRECT_URL`。
3. 应用 Prisma migrations 和 RLS SQL。
4. 在 Vercel Preview/Production 分环境配置变量。
5. 构建命令使用 `pnpm build`，Node 使用 22 LTS。
6. 配置 Supabase Auth 的 Site URL 与回调 URL。
7. Preview 验证后再晋升生产。

## 上线检查

- `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过
- 登录、退出、回调、权限与 RLS 验证
- 手机 360/390/430px 宽度无水平溢出，桌面导航正常
- AI 流式中断、超时、限流和错误态可恢复
- 上传格式、大小、所有权和签名 URL 验证
- 客户端 bundle 与日志中无密钥
- HTTPS、基础安全响应头、隐私说明和数据删除路径可用

## 成本与恢复

默认使用 Vercel/Supabase 免费或低成本层，并为 AI 请求设置用户级限流与最大 token。数据库启用 Supabase 备份能力；对象存储使用不可预测路径。重大 schema 变更先在 Preview 数据库演练，恢复以数据库备份 + 前滚 migration 为主。
