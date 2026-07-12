# 重构进度

## Phase 4A3 当前进度

- [x] Phase 4A1：人格管理与人格聊天
- [x] Phase 4A2：AI 人格草稿生成
- [x] Phase 4A3：GLM-Image 人格头像代码、migration 与自动化验证
- [ ] Phase 4A3：项目所有者真实 GLM-Image / Supabase Storage 联调
- [ ] Phase 5：尚未开始

Phase 4A3 新增独立图片 Provider、SSRF 安全下载、private Storage、`GeneratedImage` 候选、显式 Apply、头像私有读取以及 `20260712190000_add_persona_avatar_image` migration。所有 UI 继续只读取 `Persona.avatarUrl`。本环境无真实图片 Key 和 Service Role Key，因此不声明真实联调通过。

真实联调反馈的通用 `UNSAFE_IMAGE` 已拆分为脱敏服务端阶段诊断和安全的前端分类提示；同时兼容常见 JPEG/octet-stream MIME 别名与缺失 Header。SSRF、DNS 私网/Fake-IP、重定向、15 MB 和魔数限制保持启用。

## 当前状态

- [x] 现有 Streamlit 项目审计
- [x] 目标架构与迁移策略
- [x] 数据库与部署设计
- [x] Phase 1：项目初始化
- [x] Phase 2：基础系统
- [x] Phase 3：AI 聊天
- [ ] Phase 4：人格系统（4A1、4A2 已完成，4A3 本 PR 实施）
- [ ] Phase 5：记忆系统
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
