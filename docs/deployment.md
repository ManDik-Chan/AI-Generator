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
MEMORY_MAX_TOTAL=300
AI_MEMORY_MODEL=
AI_MEMORY_TEMPERATURE=0.1
AI_MEMORY_MAX_OUTPUT_TOKENS=1000
AI_MEMORY_REQUEST_TIMEOUT_MS=90000
AI_EMBEDDING_BASE_URL=
AI_EMBEDDING_API_KEY=
AI_EMBEDDING_MODEL=embedding-3
AI_EMBEDDING_DIMENSIONS=512
AI_EMBEDDING_TIMEOUT_MS=15000
MEMORY_SEMANTIC_MODE=adaptive
MEMORY_SEMANTIC_THRESHOLD=0.55
MEMORY_SEMANTIC_MAX_CANDIDATES=20
AUTH_SECRET=
```

Supabase URL 与 anon key 可在客户端使用；service role、数据库连接、AI Key 和 AUTH_SECRET 只能在服务端使用。代码不得通过 `NEXT_PUBLIC_` 暴露敏感值。

AI 环境变量必须分别配置到 Vercel Preview 与 Production，禁止写入仓库。未配置 AI 时构建仍会成功，聊天页显示配置提示，`POST /api/chat` 返回友好 503，不泄露内部配置。

Phase 5A1 使用已部署的 `20260713010000_add_memory_foundation`，本次自动提取调整没有新增 migration。`prisma/rls.sql` 已在每个 policy 前执行 `drop policy if exists`，可以安全重复运行。`AI_MEMORY_MODEL` 为空时回退 `AI_MODEL`；其余变量限制后台提取的低温度、输出和超时。上线前应连续执行两次 RLS，并用两个用户验证跨用户资源均被拒绝。

开发环境首次使用自动记忆时只输出模型名、90 秒超时和是否回退主模型，不输出 Key 或 Base URL。专用模型返回 NOT_FOUND 时可回退 `AI_MODEL` 一次；RATE_LIMITED 最多等待 2 秒重试一次；AUTHENTICATION 与 TIMEOUT 不重试。后台失败日志只包含安全阶段、请求/用户/对话/来源 ID、Provider code/status 和配置模型。

HTTP 400 会作为 `INVALID_REQUEST` 记录，并可附带服务商 error code 与最多 200 字符的脱敏 message；不会回退或重试。自动记忆和 JSON Repair 都使用 system policy + 最后一条 user data 的双消息结构，避免 GLM-compatible 接口拒绝 system-only 请求。

Phase 5A3-1 需要部署独立 migration `20260713110000_add_memory_governance`。`MEMORY_MAX_TOTAL` 默认 300，统计当前用户全部 Memory（含停用项）；达到上限后自动和手动 CREATE 被拒绝，UPDATE 继续允许，系统不会自动删除旧记忆。

Phase 5A3-2 需要部署 `20260713150000_add_memory_embeddings`，它在 Supabase `extensions` schema 启用 pgvector，并创建独立 `memory_embeddings` 表、512 维向量、Cascade 外键、普通复合索引和 RLS。部署后再次执行 `prisma/rls.sql`；该脚本可重复执行。本规模按 userId 精确扫描，不需要 HNSW/IVFFlat。

Embedding Base URL / Key 为空时分别回退 `AI_BASE_URL` / `AI_API_KEY`；仍未配置时应用可以构建和聊天，只使用关键词召回。部署环境应显式固定 `AI_EMBEDDING_DIMENSIONS=512`。现有 Memory 的安全回填命令：

```bash
pnpm memory:embed:backfill -- --all --batch-size=16 --dry-run
pnpm memory:embed:backfill -- --all --batch-size=16
# 或仅单个用户：
pnpm memory:embed:backfill -- --user=<uuid> --limit=300
```

必须显式提供 `--all` 或 `--user`。默认批次 16，最大 32；有效 hash/model/dimensions 会跳过，可中断后续跑。脚本只打印 scanned/skipped/generated/failed，不打印 Memory、向量或 Key。Provider 限流时停止，不无限重试。

### Phase 5A3-2 真实部署验收

项目所有者已确认 `20260713150000_add_memory_embeddings`、Supabase vector extension、`memory_embeddings` 和 Embedding-3 512 维均部署通过；现有 Memory 回填结果为 scanned 1、generated 1、failed 0。不同表达语义召回、Hybrid RRF、Memory 更新后向量重建、Cascade、隔离与错误配置安全降级均通过。

390px、430px、1440px 管理页和聊天无刷新验收通过。人格头像曾因本地 `SUPABASE_SERVICE_ROLE_KEY` 为空返回 503，恢复本地服务端配置后正常，确认不是本阶段代码回归。文档和仓库不记录该变量的真实值。

## Vercel 流程

## Phase 6A1 工具部署

1. 部署独立 migration `20260713190000_add_tool_runs`，它创建 `ToolType`、`ToolRunStatus`、`tool_runs`、长度/隐私约束、索引、Profile Cascade 与 RLS。
2. 再次执行最新版 `prisma/rls.sql`；所有 tool_runs policy 均先 `drop policy if exists`，脚本可重复执行。
3. 可选配置 `AI_TOOL_MODEL`、`AI_TOOL_TEMPERATURE`、`AI_TOOL_MAX_OUTPUT_TOKENS`、`AI_TOOL_REQUEST_TIMEOUT_MS` 与 `AI_DAILY_TOOL_LIMIT`。模型为空时回退 `AI_MODEL`，Base URL 与 Key 复用现有服务端 AI 配置。
4. 未配置 AI Key 时 `/tools` 仍能构建和打开，提交返回友好 503。工具不要求真实 pgvector 连接。
5. PENDING 超过 15 分钟会在用户打开工具历史时安全恢复为 ERROR/TIMEOUT，避免永久 PENDING。每日次数按 UTC 日期统计所有终态和 PENDING；输入校验失败不计数。

项目所有者已确认 `20260713190000_add_tool_runs`、最新版 RLS、真实 GLM-5.2 三工具、SSE/停止与迟到流保护、历史隐私、每日限额、Prompt 注入复验和 390/430/768/1440px 全部通过。聊天、人格、头像和长期记忆无回归；页面无全屏 loading 或整页刷新。工具不创建聊天记录、不读取或写入长期记忆、不绑定 Persona。仓库和文档不记录真实 Key、数据库凭据、用户测试正文或模型原始输出。Phase 6A2 与 Phase 7 未开始。

## Phase 6A2 图片理解部署

1. 部署 `20260713220000_add_tool_assets`，再执行最新版 `prisma/rls.sql`。
2. 在 Supabase Storage 创建 private bucket（默认 `tool-assets`），不得设为 public；将名称写入服务端 `AI_TOOL_ASSET_BUCKET`。
3. 配置 `AI_VISION_MODEL`。`AI_VISION_BASE_URL` / `AI_VISION_API_KEY` 可回退现有 AI 配置；`SUPABASE_SERVICE_ROLE_KEY` 只能存在于服务端。
4. 可配置 `AI_DAILY_VISION_LIMIT=10`、`AI_TOOL_ASSET_RETENTION_DAYS=7`、视觉 token 与超时。
5. 定时运行 `pnpm tool-assets:cleanup` 清理到期对象。日志只含资源/运行标识和计数，不含路径、signed URL、图片或问题。
6. 回滚时先停止图片入口与清理任务；保留 migration 前滚历史。清理 Storage 后再通过新的补偿 migration 删除数据结构，禁止编辑已部署 migration。

故障排查：503 先检查 private bucket、服务端 Service Role 和视觉模型配置；410 表示图片到期；429 表示视觉日限额。无视觉配置时生产构建、文本工具、聊天、人格和记忆仍应正常。

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

## Phase 6A3 图片生成部署

1. 部署独立 migration `20260716190000_add_image_generation_tool`，不得修改任何旧 migration。
2. 重新执行最新版 `prisma/rls.sql`，确认 authenticated 对 GeneratedImage 只有 select-own，INSERT/UPDATE/DELETE 必须走 trusted server；复合外键继续保证工具图片绑定同一用户 ToolRun。
3. 在 Supabase Storage 创建 private bucket（默认 `generated-images`），配置 `SUPABASE_GENERATED_IMAGE_BUCKET`；不得设为 public。
4. 配置现有 `AI_IMAGE_*` 服务端变量，并按需设置 `AI_DAILY_IMAGE_GENERATION_LIMIT=5`。图片 Base URL/Key、Service Role Key 均不得使用 `NEXT_PUBLIC_`。
5. 真实验收预览、下载、删除、停止补偿、跨用户隔离、Bucket/Path 防篡改、额度、Prompt 注入和 390/430/768/1440px。日志不得包含 Prompt、远程临时 URL、Storage path、signed URL、密钥或图片字节。

没有真实图片 Key、bucket 或数据库连接时，生产构建仍应通过，聊天、Persona、Memory、文本工具和图片分析保持可用。回滚应用前先停止新图片运行；如需回滚数据库，应先清理 TOOL_GENERATION 对象与记录，并由项目所有者评估 enum/列回退，禁止直接修改已部署 migration。

## 成本与恢复

默认使用 Vercel/Supabase 免费或低成本层，并为 AI 请求设置用户级限流与最大 token。数据库启用 Supabase 备份能力；对象存储使用不可预测路径。重大 schema 变更先在 Preview 数据库演练，恢复以数据库备份 + 前滚 migration 为主。
