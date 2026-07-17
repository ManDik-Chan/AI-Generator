# 重构进度

## Phase 7A1 多 Agent 头脑风暴（Draft）

- [x] `/tools/brainstorm` Premium 工作台与工具中心/历史入口
- [x] 固定分析研究员、创意探索者、批判审查员、落地规划师四个 Worker
- [x] 四 Worker 并发执行，至少两个成功后由协调器综合，总调用最多五次且不自动重试
- [x] `ToolType.BRAINSTORM`、`BrainstormWorker`、复合所有权外键和独立 migration
- [x] BrainstormWorker authenticated select-own RLS，写操作仅由 trusted server 执行
- [x] ToolRun waitUntil、SSE observer、durable cancellation、状态恢复和迟到终态保护
- [x] 普通用户独立每日 3 次额度与 ADMIN 豁免/真实用量
- [x] 保存历史开关、短期 recovery 与过期正文清理
- [x] 服务端固定角色/模型/调用次数，用户与 Worker 中间输出均按不可信数据处理
- [x] 头脑风暴历史、复制、TXT/Markdown 下载、再次回填和级联删除
- [x] 浏览器 favicon、512px 应用图标与 180px Apple 图标
- [x] 自动测试、lint、typecheck、无密钥构建和 Prisma 校验
- [ ] 项目所有者部署 `20260717180000_add_brainstorm_workers` 与最新版 RLS
- [ ] 项目所有者真实模型、取消、手机后台恢复、隐私清理与响应式验收

本阶段没有 Vibe Coding、代码执行、Shell、Git 写操作、浏览器自动化、MCP、联网搜索、文件上传、RAG、递归 Agent 或多轮自动循环。Phase 7A2 尚未开始。

## Phase 6A3 通用 AI 图片生成工作台（项目所有者真实验收通过）

- [x] `/tools/image-generate` 单图生成工作台、服务端风格白名单与明确点击调用
- [x] `IMAGE_GENERATE` ToolRun、独立 Serializable 每日限额与 ADMIN 真实用量显示
- [x] `GeneratedImageKind`、同用户 ToolRun 一对一绑定与独立 migration
- [x] private `generated-images` Storage、随机路径、私有预览/下载与删除补偿
- [x] 复用 ImageProvider、GLM-Image、SSRF 安全下载与魔数校验
- [x] run/progress/done/cancelled/error SSE、真实阶段和迟到终态保护
- [x] 私有分页画廊、再次创作、下载、删除与通用工具历史
- [x] Prompt 不可信数据边界，不读取 Persona/Memory，不创建 Conversation/Message
- [x] Service Role Bucket/Path 可信目标解析、GeneratedImage server-only 写 RLS
- [x] 结果元数据、复制原始描述、加载失败状态与历史再次创作回填
- [x] 自动测试、lint、typecheck、无密钥构建和 Prisma 校验
- [x] 修复文本工具卡片等高布局，移除首卡 row-span/index 特例
- [x] waitUntil 后台生命周期、transport detached/explicit cancel 分离与 durable recovery
- [x] Chat/ToolRun partial output 节流持久化、Persona GenerationRun 与所有者 status/cancel API
- [x] 项目所有者真实 Supabase migration / RLS / private bucket 验收
- [x] 项目所有者真实 GLM-Image、停止、隔离与 390/430/768/1440px 验收

本阶段不包含图片编辑、局部重绘、多图、视频、专业 OCR、文件/网页/图片 RAG 或公开分享。Phase 7A1 现已进入 Draft，Phase 7A2 尚未开始。

## Phase 6B1 全产品 UI 迁移（待第三次真实视觉验收）

- 项目所有者未通过第一次自由设计方向；上传的 Premium 高保真原型现为 Phase 6B 主要视觉基准。
- 已按原型重映射纸张浅色、深炭深色、翡翠/藏蓝/暖金 Token，主按钮改用深墨色，并重调圆角、阴影、边框和 reduced-motion。
- 已迁移原型双星品牌、272/230px 桌面 rail、68px 移动 header、悬浮五项 tabbar、真实资料区和分组导航。
- 已迁移首页大型 Hero、AI Core、轨道、Aurora、能力标签、不对称 Quick Start、四张编号 Studio 卡和隐私说明。
- Quick Start 只查询当前用户最新一条真实 Conversation，并展示真实标题、更新时间与 Persona；无记录时显示诚实空状态，不查询或伪造消息数。
- 已统一登录、注册、账号、管理员外壳、404、loading 和 error 页面；认证和权限逻辑保持不变。
- 第二次视觉验收取消原先的阶段范围限制；已在同一分支和 PR 中完成 Chat、Persona、Memory、Tools、图片分析与工具历史的页面级 Premium 迁移。
- Chat 已迁移为响应式历史 rail、消息画布和助手 dock，保留 SSE、停止生成、编辑重提、临时 ID、上下文隔离和错误终态语义。
- Persona 已迁移列表、创建、详情、编辑、实时预览、AI 草稿、AI 头像、回收站与恢复；所有展示继续只读取真实 Persona 数据。
- Memory 已迁移真实容量、启用/置顶/语义状态、搜索筛选和治理操作；不展示内部 topicKey，不制造使用量或索引状态。
- Tools 已迁移文本工作台、图片分析、隐私保留、额度、流式终态和历史；只展示已实现能力与真实 ToolRun/ToolAsset 状态。
- 已在 390、430、520、768、820、1024、1180、1440、1920px 检查 Chat、Persona、Memory、文本工具、图片工具和历史，无水平溢出；浅色、深色、跟随系统及 reduced-motion 约束保持有效。
- 原型中的 ManDik、假对话、假时间、假消息数、假 Persona、网页分析、自定义首页、隐私中心、分享和假快捷键均未迁移。
- 未改变认证 Server Action、AI、SSE、聊天、人格、记忆、工具、Storage、限额、RLS 或数据库结构；未新增 migration。
- 没有修改 API、Provider、Prisma Schema、RLS、migration 或数据库结构；没有开始 Phase 6C。
- 当前等待项目所有者第三次真实视觉验收。

## Phase 6A1 完成状态

项目所有者已完成真实本地验收。`20260713190000_add_tool_runs` migration 与最新版 `prisma/rls.sql` 部署通过；真实 GLM-5.2 总结、改写、翻译，SSE、停止生成、CANCELLED 迟到保护、历史隐私开关、每日限额、导航和 390/430/768/1440px 响应式均通过。

Prompt 注入复验已通过：可信工具类型、白名单选项与输出契约全部位于 system，user 仅包含 JSON 序列化的不可信文本；攻击内容仍按当前总结、改写或翻译任务处理，不获得指令权限。有限滚动输出守卫只作为明显泄露兜底，普通安全主题文章不会被误拦截。

- [x] 通用工具框架、统一 `POST /api/tools/run` 与应用自有 SSE 协议
- [x] 文本总结、改写润色、多语言翻译
- [x] `ToolRun` Schema、独立 migration、RLS 与所有权双重校验
- [x] 停止生成、迟到流保护、PENDING 恢复、历史与隐私开关
- [x] UTC 每日工具次数限制与 ADMIN 策略
- [x] `/tools`、三项工具页、历史页、桌面/移动导航 active 状态
- [x] 自动测试、lint、typecheck、无密钥构建与 Prisma 校验
- [x] 项目所有者真实 Supabase migration / RLS 验收
- [x] 项目所有者真实 GLM-5.2 三工具、Prompt 注入与响应式验收

工具运行不会创建 Conversation/Message，不读取或写入长期记忆，也不绑定 Persona。Phase 6A1 不包含文件上传、OCR、文件解析、网页抓取、搜索、文件/网页 RAG、Message 向量化、医疗/法律/旅行工具或图片生成。Phase 6A2 与 Phase 7 未开始。

## Phase 5A3-2 完成状态

- [x] Phase 4A1：人格管理与人格聊天
- [x] Phase 4A2：AI 人格草稿生成
- [x] Phase 4A3：GLM-Image 人格头像、交互收尾与自动化验证
- [x] Phase 4A3：项目所有者真实 GLM-Image / Supabase Storage 联调
- [x] Phase 5A1：自动长期记忆、用户控制、安全召回与聊天注入（真实验收通过）
- [x] Phase 5A3-1：记忆召回质量、主题冲突与容量治理（真实验收通过）
- [x] Phase 5A3-2：混合语义记忆召回（真实验收通过）

Phase 4A3 新增独立图片 Provider、SSRF 安全下载、private Storage、`GeneratedImage` 候选、显式 Apply、头像私有读取以及 `20260712190000_add_persona_avatar_image` migration。所有 UI 继续只读取 `Persona.avatarUrl`。项目所有者已于 2026-07-13 完成真实 GLM-Image、Supabase Storage 与完整产品交互验收，Phase 4A3 已完成。

真实联调反馈的通用 `UNSAFE_IMAGE` 已拆分为脱敏服务端阶段诊断和安全的前端分类提示；同时兼容常见 JPEG/octet-stream MIME 别名与缺失 Header。SSRF、DNS 私网/Fake-IP、重定向、15 MB 和魔数限制保持启用。

Phase 4A3 交互收尾将新对话的顶部横向人格选择器迁移为桌面右侧助手栏和移动端抽屉；选择只更新客户端空状态与 URL，首条消息发送时才绑定 Persona。用户可见的“归档”流程改为三点菜单中的“删除人格”、确认对话框与 `/personas/trash` 回收站；底层继续使用 `archivedAt`，没有新增 migration。回收站人格的历史对话可查看但前后端均禁止继续发送，恢复后原对话重新可用。

真实视觉验收发现的头像 Dialog 条件卸载问题已通过稳定的受控 `PersonaHeaderClient` 修复；AI 头像入口恢复为详情页显式主操作。AI 人格草稿和 GLM-Image 候选接口均改为真实 SSE 阶段反馈，共享无虚假百分比的计时进度组件。Apply API 返回 cache-buster `avatarUrl`，详情页本地状态即时更新，不依赖 `router.refresh()` 显示。

Phase 5A1 产品方向已调整为自然自动记忆：成功回答后通过 Next.js `after` 单次后台提取，执行 CREATE / UPDATE / IGNORE；管理页用于用户控制，手动添加降为高级入口。确定性召回、安全 Prompt、memory SSE 和 `lastUsedAt` 保持不变。没有 Embedding、向量数据库或 RAG。

真实验收发现明确“记住我的电脑配置”无法利用更早 USER 内容，且模型 JSON 包装会导致解析失败。现已增加显式记忆意图分类、同对话最多 15 条历史 USER 扩展上下文、USER 事实可追溯检查、主题合并/UPDATE 指令、JSON 包装兼容与最多一次修复请求；基础助手也不再否认长期记忆能力。

随后真实联调定位到后台错误诊断只记录 `AiProviderError` 类名。现已增加八阶段安全诊断、真实 Provider code/status、开发环境脱敏配置提示，以及 NOT_FOUND 主模型回退、RATE_LIMITED 单次延迟重试、90 秒默认超时和部分 INVALID_RESPONSE 文本继续解析。

最新真实日志确认 GLM-5.2 对记忆 system-only 请求返回 HTTP 400。提取与 JSON Repair 已改为 system policy + final user data；400 映射为 `INVALID_REQUEST`，安全提取并脱敏服务商 code/message，且不重试、不回退、不修复、不写 Memory。

项目所有者已在真实 Supabase 执行 `20260713010000_add_memory_foundation`，并确认最新版 RLS 可重复执行。真实 GLM-5.2 system + user 自动记忆、明确记忆请求、PREVIOUS_CONTEXT、管理页控制和连续聊天无全屏 loading 均已通过。Phase 5A1 于 2026-07-13 完成。

Phase 5A3-1 增加 topicKey、keywords、pinned、useCount、同主题 CREATE→UPDATE、确定性召回多样性、原子使用统计、默认 300 条容量和管理页治理 UI。旧 migration 不修改，不自动清理或删除 Memory；Embedding、向量数据库、RAG、Phase 5A3-2 和 Phase 6 均未开始。

Phase 5A3-1 自动验证：47 个测试文件、277 项测试通过。

项目所有者已于 2026-07-13 完成 Phase 5A3-1 真实本地验收：`20260713110000_add_memory_governance` 已成功部署，`topicKey`、`keywords`、`pinned`、`useCount` 正常；GLM-5.2 自动 CREATE、关键词召回和同一对话第二次 UPDATE 通过。RTX 5070 Ti 可在保持原 Memory ID、CPU、显示器和 `topicKey` 的前提下更新为 RTX 5080，`keywords` 与 `sourceMessageId` 正确更新且不产生重复主题。`thinking: disabled` 已解决 reasoning-only 空响应，置顶、容量治理、使用统计、响应式管理页和聊天无刷新均通过真实验收。

Phase 5A3-1 已完成；该阶段本身没有引入 Embedding、向量数据库或 RAG。

Phase 5A3-2 在确定性召回之上增加通用 OpenAI-compatible Embedding Provider、独立 512 维 `MemoryEmbedding`、Supabase pgvector 精确余弦查询、contentHash 生命周期、批量回填、adaptive 触发与稳定 Hybrid RRF。未配置或运行失败时安全退回现有确定性召回；不处理 Message、文件、网页或外部知识库，不属于文件 RAG。

项目所有者已于 2026-07-13 完成真实本地验收：`20260713150000_add_memory_embeddings` 部署成功，Supabase vector extension 与 `memory_embeddings` 正常，Embedding-3 固定 512 维回填结果为 scanned 1 / generated 1 / failed 0。以“中央处理单元”“设备核心硬件”“负责图形运算的部件”等不同表达召回 CPU、完整电脑配置和显卡均通过；确定性关键词、`topicKey` / `keywords` 与 Hybrid RRF 无退化。Memory 更新后的 contentHash/向量同步、用户与 Persona 隔离、Cascade 删除、安全降级、响应式管理页、聊天流式、浅 URL 和无整页刷新均通过。

人格头像曾因本地 `SUPABASE_SERVICE_ROLE_KEY` 为空返回 503；恢复本地配置后正常，确认属于本地环境配置而非 Phase 5A3-2 回归。未提交任何真实配置值。Phase 5A3-2 已完成，Phase 6 未开始。

Phase 5A3-2 自动验证：55 个测试文件、311 项测试通过；lint、typecheck、无专用 Embedding Key/无 pgvector 连接的生产构建和 Prisma Schema 校验通过。

## 当前状态

- [x] 现有 Streamlit 项目审计
- [x] 目标架构与迁移策略
- [x] 数据库与部署设计
- [x] Phase 1：项目初始化
- [x] Phase 2：基础系统
- [x] Phase 3：AI 聊天
- [ ] Phase 4：人格系统（4A1、4A2、4A3 已完成）
- [x] Phase 5：记忆系统（Phase 5A1、Phase 5A3-1、Phase 5A3-2 已完成）
- [ ] Phase 6：工具箱
- [ ] Phase 7：优化与部署

## 审计摘要

推荐新建 V2 并归档旧版。旧版多 Provider 抽象、人格提示词和头像可选择性复用；医疗、法律、合同、旅行和垂类内容生成不进入核心版本。

## Phase 1 完成记录

完成时间：2026-07-11

- 初始化 Next.js 15.5.20、React 19、TypeScript strict、Tailwind CSS 与 ESLint。
- 建立 shadcn 风格基础组件、Framer Motion 首页动效和响应式应用壳层。
- 建立 `app/components/features/lib/public/types/docs` 模块结构。
- 实现手机五栏底部导航、桌面五项侧栏和系统浅色/暗色主题。
- 将旧 Streamlit 原型完整归档到 `legacy/streamlit`。
- 使用项目级 `allowBuilds` 明确授权 Next.js 构建链的 `sharp` 与 `unrs-resolver` 安装脚本。
- 将存在公开安全警告的 Next.js 15.5.7 升级到 15 分支补丁版 15.5.20。

### 验证

- `pnpm lint`：通过（0 warnings）
- `pnpm typecheck`：通过
- `pnpm build`：通过，首页静态预渲染成功
- 375px 手机视口：无水平溢出，移动导航显示，桌面侧栏隐藏
- 1440px 桌面视口：无水平溢出，桌面侧栏显示，移动导航隐藏
- 浏览器控制台：无 error 日志

## Phase 2 实施记录

实施时间：2026-07-11
完成验收：2026-07-12

- 增加 Prisma 6.19.3 schema、初始 SQL migration 和 Supabase RLS/新用户 trigger。
- 建立 Profile、Persona、Conversation、Message、Memory、GeneratedImage、ModelConfig 与 AppSetting 数据模型。
- 实现 Supabase SSR 浏览器/服务端客户端、middleware 会话刷新和受保护路由。
- 实现邮箱注册、登录、退出、Auth callback、账号页以及 ADMIN/USER 服务端守卫。
- 增加 Supabase 配置文档与无真实密钥的环境变量模板。

### 已完成验证

- `prisma validate`：通过
- `pnpm install`：通过，Prisma Client 生成成功
- `pnpm lint`：通过，0 warnings
- `pnpm typecheck`：通过
- `pnpm build`：通过，公开页面可静态生成，账号/管理员页面按需动态渲染
- Production smoke：`/` 与 `/login` 返回 200；无 Supabase 配置访问 `/account` 返回 307 到配置提示页

### 真实 Supabase 联调

- Prisma migration 执行成功。
- `prisma/rls.sql` 执行成功。
- 用户注册与邮箱验证成功。
- 登录、退出和会话保持正常。
- Profile 可自动创建，默认角色为 `USER`。
- `USER` 无法访问 `/admin`。
- 提升为 `ADMIN` 后可以访问 `/admin`。
- 本地 `.env` 未提交 Git。

Phase 2 真实环境联调与权限验收已全部通过。

## Phase 3 实施记录

实施时间：2026-07-12
完成验收：2026-07-12

- 建立原生 fetch 的 OpenAI-compatible Provider、SSE 增量解析、超时与错误归一化。
- 实现 `/api/chat` 登录校验、输入限制、UTC 每日次数保护、上下文预算与统一 SSE。
- 实现新建/历史/打开/删除对话、消息持久化和用户所有权校验。
- 实现流式消息、停止生成、Markdown、代码高亮/复制和移动端历史抽屉。
- 修复中断或失败的不完整轮次污染下一轮上下文：只发送未被替代的完整问答轮次，并按整轮执行消息数与字符预算。
- 增加最后一条有效用户消息的停止、内联编辑与重新提交；旧版本通过 `superseded_at` 保留，并发编辑和迟到流均有服务端保护。
- 修复停止编辑发生在 `turn` 前的临时 ID 竞态：增加带对话版本保护的 `editLastMessage` 协议，前端不再发送 `user-…` 临时 ID；同时拆分 Composer 禁用原因，编辑状态不再误报 AI 未配置。
- 补齐聊天页导航：移动顶栏提供常驻首页按钮、品牌图标可点击，桌面侧栏与移动历史抽屉共享“返回首页 / 新建对话 / 历史”入口。
- 沿用现有 Prisma Schema、RLS 与认证基础，未引入 Persona、记忆或其他 Phase 4 功能。

### 自动验证

- Provider、配置、输入、标题、完整轮次上下文、限额、所有权、编辑规划、迟到流保护、活动消息查询和聊天导航共 55 项自动测试通过。
- migration `20260712093000_add_message_superseded_at` 已由项目所有者在真实 Supabase 环境完成部署和验收。
- 未配置 AI 时可构建、可打开页面并返回友好提示。
- 无本地密钥 Production smoke：`/` 与 `/login` 返回 200，未登录 `/chat` 返回 307 到登录页，`/api/chat` 返回友好 503 而非通用 500。

### 真实环境验收

- GLM-5.2 中文调用、SSE 流式增量输出和多轮上下文通过。
- Markdown、表格、代码块、复制、对话与消息持久化、刷新恢复通过。
- 停止生成、中断后完整轮次上下文隔离通过，未发现永久 `PENDING` 消息。
- 最后一条用户消息停止、编辑、重新提交通过；`turn` SSE 前立即停止编辑通过，不再出现 `editMessageId` 格式错误或 AI 配置误报。
- `superseded_at` migration、消息替代、旧版本上下文隔离通过。
- 删除对话、用户权限和数据隔离通过。
- 桌面侧栏、手机顶栏、移动抽屉和品牌图标返回首页通过。
- 390px、430px、1440px 布局通过，浏览器控制台无严重错误。

Phase 3 真实环境联调、数据迁移与功能验收已全部通过。

## Phase 4A 实施记录

实施时间：2026-07-12

- 增加 Persona `greeting` 与 `archivedAt`，以软归档保留历史 Conversation 关系。
- 实现私有人格活跃/归档列表、手动创建、编辑、详情、归档和恢复。
- 提供 12 个本地 SVG 预设头像和名称首字渐变回退，不接入上传、Storage 或图片生成。
- 建立字段验证、本地 systemPrompt 构建、实时预览和服务端所有者校验。
- 新对话可选择 active Persona 并写入现有 `Conversation.personaId`；已有对话禁止切换。
- 服务端在基础安全 Prompt 之后注入 Persona，归档人格的历史对话继续可用。
- greeting 仅作为空页面欢迎内容，不创建 Message、不进入上下文。
- 未实现 AI 生成人格、人格市场、分享、版本历史、长期记忆、RAG、文件或图片功能。

### 自动验证

- `pnpm test`：18 个测试文件、86 项测试通过。
- `pnpm lint`：通过，0 warnings。
- `pnpm typecheck`：通过。
- `pnpm build`：无 Supabase/GLM 密钥环境通过。
- `pnpm exec prisma validate`：通过。
- 无配置 Production smoke：`/` 返回 200，`/personas` 返回 307 到配置提示登录页。

### 真实环境验收

- Supabase migration、创建、编辑、归档、恢复和用户数据隔离通过。
- Persona 绑定、刷新恢复、归档人格历史对话、默认助手和真实 GLM-5.2 人格表达通过。
- 页面、移动端布局、停止生成和编辑重提回归通过。
- 已修复 Persona 对话助手消息仍显示默认 Bot 的头像传递问题：所有助手消息状态统一复用 `AssistantAvatar`，只读取 `Persona.avatarUrl`；待项目所有者按头像专项步骤复测。

## Phase 4A2 实施记录

- `/personas/new` 保留手动创建，并增加 AI 生成草稿模式、示例填充、取消、重新生成确认和失败保留旧草稿。
- 新增登录态 `POST /api/personas/generate`；打开页面和示例按钮不会调用模型，保存前不写 Persona、Conversation 或 Message。
- 复用 OpenAI-compatible `streamText`，通过独立 `collectGeneratedText` 收集非流式文本，不复制 SSE 解析。
- 严格校验描述与模型 JSON，兼容 JSON code fence/首个完整对象；仅失败时允许一次修复请求。
- 模型不能控制 `systemPrompt`、`avatarUrl`、ID 或所有者；服务端只映射稳定 `avatarPresetId` 并生成安全 Prompt 预览。
- 同一次模型响应生成 `avatarPrompt`；本阶段不调用图片模型、Storage 或 GeneratedImage。
- Phase 5 记忆系统未开始。

### 自动验证

- `pnpm install --frozen-lockfile`：通过。
- `pnpm test`：21 个测试文件、113 项测试通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm exec prisma validate`：通过。
- 无 AI Key 构建通过；未新增数据库 migration。

## Phase 5A1 实施记录

实施时间：2026-07-13
完成验收：2026-07-13

- 扩展现有 Memory 数据模型：GLOBAL/PERSONA、MANUAL/CHAT_MESSAGE/AUTO_EXTRACTED 来源、Persona、来源消息、`lastUsedAt` 与 Profile 总开关。
- migration 对旧数据回填 GLOBAL/MANUAL，并增加关系约束、检查约束和查询索引；RLS 同时校验 Memory 所有者与关联 Persona/Conversation/Message 所有者。
- `/memories` 重新定位为“AI 记住的内容”，支持编辑、启停、删除、筛选和总开关；手动添加只在更多操作中保留。
- 助手成功 COMPLETE 后发送 done，并使用 Next.js `after` 非阻塞安排一次自动提取；停止、ERROR、superseded 和总开关关闭时不执行。
- 自动提取严格使用最多三项 CREATE / UPDATE / IGNORE、0.85 置信度、候选 ID 白名单、当前 Persona 服务端映射和 Serializable 事务。
- 高置信度 API Key、访问令牌、私钥与含密码的数据库连接会被拒绝；同一作用域内规范化后完全相同的内容会被判定为重复。
- 聊天使用确定性关键词/中文双字词、近期上下文、重要程度和时间排序，默认最多 8 条、2,400 字符，并限制无直接相关的高重要性兜底条目。
- 记忆文本作为 XML 转义的不可信信息注入，不执行其中的 Prompt 指令；召回失败安全降级，SSE 仅公开使用数量。
- 只有助手成功 COMPLETE 后更新 `lastUsedAt`，停止或 Provider ERROR 不更新。
- 桌面导航、账号页和 Persona 详情增加记忆入口；移动端仍保持五项导航，并修正“我的”入口到 `/account`。

### 自动验证

- 记忆输入、凭据拦截、自动提取、非阻塞 after、关系所有权、作用域隔离、确定性召回、预算、Prompt 转义和聊天无导航刷新均有自动测试。
- `pnpm install`：通过，依赖已是最新状态。
- `pnpm test`：46 个测试文件、261 项测试通过。
- `pnpm lint`：通过，0 warnings。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，`/memories` 按需动态渲染。
- `pnpm exec prisma validate`：使用仅对验证进程生效的非真实占位 URL 通过 Schema 校验；没有连接真实数据库。
- 真实 Supabase migration、GLM 自动记忆与浏览器连续聊天无全屏 loading：项目所有者验收通过。

### 真实环境验收

- Supabase Memory migration 部署成功，最新版 RLS 脚本可重复执行。
- 普通 GLM-5.2 聊天流式输出正常；自动记忆 system + user 请求成功且后台任务不阻塞聊天。
- 明确“请记住”请求可创建 Memory，PREVIOUS_CONTEXT 可从当前对话更早 USER 消息提取事实。
- 自动记忆可在 `/memories` 查看；总开关、编辑、停用和删除正常。
- 助手不再虚假承诺已经保存成功。
- 新对话通过 History API 浅更新 URL；回答完成后不再触发全屏 loading。
- 未提交 `.env`、API Key、Service Role Key 或数据库密码。
- 没有 Embedding 或 RAG；Phase 5A3 和 Phase 6 未开始。

Phase 5A1 真实环境验收已全部通过。

## Phase 6A2 完成状态

项目所有者已完成真实环境验收，Phase 6A2 全部通过。

- 从最新 `main` 的 Phase 6A1 工具框架扩展 `IMAGE_ANALYZE`，保留 ToolRun、SSE、停止生成、终态保护和工具历史语义。
- 新增独立 migration `20260713220000_add_tool_assets`、`ToolAsset`、所有者关系、Cascade、到期时间与 RLS；不复用 `GeneratedImage`。
- `/tools/image` 支持单张 PNG/JPEG/WebP 拖放/选择、预览、问题、模式、详细程度、语言、历史开关、流式结果、停止、复制与 TXT/Markdown 下载。
- 上传在服务端执行 10 MB、4000 万像素、MIME/魔数/解码校验；使用 sharp 重编码并剥离元数据，Storage 路径使用 UUID。
- 使用 private `tool-assets` bucket（可配置）、60 秒 signed URL、7 天默认保留和可重复清理脚本；关闭历史时终态清理资源。
- 视觉 Provider、模型、超时、输出 token 和每日 10 次限额独立配置；Base URL/Key 可回退现有 AI 配置，模型必须显式设置。
- 图片与问题均作为不可信数据；不读取 Persona/Memory，不创建 Conversation/Message，不执行图片中的 Prompt 注入。
- [x] `20260713220000_add_tool_assets` migration、最新版 RLS 与 private `tool-assets` bucket 真实部署通过。
- [x] JPEG、PNG、WebP 上传、净化、预览与真实视觉模型调用通过；三种模式、三档详细程度和中英文输出通过。
- [x] SSE、停止、部分结果、CANCELLED 持久化与迟到流保护通过。
- [x] 历史开启时缩略图、详情、复制、下载、再次分析和删除通过；历史关闭时正文与图片资源清理通过。
- [x] 到期清理与“原图片已到期清理”状态通过；非法、损坏、伪装、超大和超像素图片均在模型调用前拦截。
- [x] 跨用户读取/删除隔离与图片 Prompt 注入复验通过。
- [x] ADMIN 不限次数且显示真实已用数量；普通 USER 显示真实剩余数量并在合法运行开始后扣减。
- [x] 390px、430px、768px、1440px 响应式及文本工具、聊天、人格、头像、长期记忆回归通过。
- [x] 未发现 API Key、Service Role Key、数据库密码、用户原图、Base64、signed URL、真实用户内容进入提交或日志。
- 不包含 PDF/DOCX/PPTX/TXT、专业 OCR、网页、RAG、多图、视频、图片生成/编辑；Phase 6A3 和 Phase 7 未开始。
