# AI-Generator V2 架构设计

## Phase 4A3 图片边界

Persona 头像使用独立 `ImageProvider`，不进入文本 `AiProvider`。GLM-Image 临时 URL 经 SSRF 安全下载后写入 Supabase private Storage，`GeneratedImage` 保存来源元数据，Persona 通过稳定的所有权校验路由暴露 `avatarUrl`。生成候选与 Apply 分离，模型成功不会自动覆盖现有头像。

文本人格草稿与头像候选生成都使用统一的 SSE 进度消费方式和 `GenerationProgress` 组件，但服务端只在真实执行点发送阶段事件，不使用计时器伪造进度。头像安全下载在字节读取完成、进入魔数检查前发出 `validating`；Apply 仍是独立事务，并把稳定 cache-buster URL 返回给客户端进行即时状态更新。

## Phase 5A1 记忆边界

长期记忆位于 `features/memory`，页面与 Server Actions 只操作当前用户的数据。`Memory.scope` 明确区分 GLOBAL 与 PERSONA；PERSONA、来源 Conversation 和来源 Message 均由服务端按所有权校验，数据库 RLS 再次约束关联资源。`AUTO_EXTRACTED` 仅作为未来枚举预留，本阶段没有自动提取任务或额外模型调用。

聊天请求从启用且属于当前用户的候选中，以当前消息、近期用户消息、作用域、重要程度和更新时间执行确定性排序，并同时受条目数与字符数预算约束。选中的文本经过 XML 转义后作为“不可信用户保存信息”追加到服务端 system message；它不能覆盖安全规则、Persona 边界或当前请求。召回失败降级为无记忆聊天，浏览器 SSE 仅收到数量，不收到记忆内容或数据库标识。

`lastUsedAt` 只在助手消息成功写为 COMPLETE 后更新。Provider 失败、取消或记忆状态写入失败不会破坏主聊天流程。本阶段不引入 Embedding、向量库、语义检索、自动总结或记忆冲突合并。

新聊天在 `xl` 桌面断点使用固定右侧助手栏，窄屏使用无第三方依赖的可访问抽屉；两者共享同一选择组件。选择状态保留在现有 `ChatLayout`，通过 History API 更新 `/chat?personaId=`，不创建数据库记录、不清空 Composer 草稿。已有 Conversation 不渲染选择栏，服务端继续拥有 Persona 绑定的最终决定权。

## 1. 现状审计

### 当前技术栈

- Python + Streamlit 单体应用
- LangChain 0.3、OpenAI SDK、DashScope 与直接 HTTP 请求
- 会话数据存储在 `st.session_state`，无数据库
- API Key 由用户在界面输入或从 Streamlit secrets 读取
- 无认证、权限、自动化测试、lint/typecheck/build 流程

### 当前目录与规模

旧版约 3,800 行 Python，入口 `demo.py` 约 849 行。业务代码分散在根目录，`utils.py` 同时承担模型调用、文档解析、提示词和业务逻辑。`avatar_manager.py` 存在重复实现。

### 可复用资产

- `api_clients.py` 的多 Provider 抽象思路与错误类型
- `character_templates.py` 的人格提示词内容（迁移时需安全与质量复核）
- `assets/avatars` 的头像图片
- PDF/DOCX/图片文本提取的需求与提示词思路
- 文本生成、总结、翻译等产品需求经验

### 退出 V2 主线的模块

- 医疗建议、用药建议和医院匹配
- 法律咨询、合同生成与风险分析
- 旅行攻略、小红书和短视频专用页面
- 重复头像管理器、重复 Provider 请求实现

这些模块先放入 `legacy/streamlit` 只读归档，不在 Phase 1 物理删除。后续若重新引入，必须作为经过安全评审的独立工具。

### 主要风险

1. 旧版没有持久化数据，无法自动迁移历史会话。
2. 旧版人格模板只有松散字典，需要映射到数据库实体。
3. Provider 调用重复且模型名称过期，不能直接照搬。
4. API Key 曾进入客户端会话；V2 必须只在服务端读取密钥。
5. 医疗/法律内容存在高风险，不应作为核心版本默认能力。
6. 当前机器系统 PATH 未提供 Node/pnpm，开发需使用 Node 22 或工作区自带运行时。

## 2. 迁移决策

采用“新建 V2 + 旧版归档”，而不是在 Streamlit 上渐进修补。

原因：目标运行时、渲染模型、认证、数据模型和部署平台全部变化；在旧单体内渐进替换会形成 Python 与 Next.js 双栈耦合。V2 使用同一仓库的新根结构，旧版保存在 `legacy/streamlit` 供参考，按阶段迁移经过筛选的内容。

## 3. 目标架构

```text
Browser / PWA
      |
Next.js App Router
  |-- React Server Components
  |-- Client Components (仅交互状态)
  |-- Server Actions (表单型写操作)
  `-- Route Handlers (流式 AI、上传、Webhook)
      |
Application modules (features/*)
      |
lib/auth | lib/database | lib/ai | lib/storage
      |
Supabase Auth + PostgreSQL + Object Storage + AI Providers
```

### 模块边界

- `app/`：路由、布局、错误边界和 Route Handlers；不堆积业务实现。
- `components/`：跨功能共享的 UI 与应用壳层。
- `features/`：chat、persona、memory、tools 等业务模块。
- `lib/ai/`：统一 Provider 接口、模型注册表、流式协议与错误映射。
- `lib/auth/`：Supabase 服务端/客户端适配与权限守卫。
- `lib/database/`：Prisma 客户端、查询辅助和事务边界。
- `types/`：跨模块 DTO；数据库类型优先由 Prisma 生成。

### AI Gateway 边界

所有 Provider 只在服务端实例化。统一接口至少包含 `streamText`、`generateText` 和 `analyzeImage`。业务代码传入能力需求，不直接拼接供应商 URL。Provider 与模型通过环境变量和服务端配置选择。

Phase 3 首个实现位于 `lib/ai/providers/openai-compatible.ts`，使用原生 `fetch` 调用 Chat Completions SSE。聊天 API 只消费统一文本增量，不解析或向前端暴露服务商原始结构。Provider 配置延迟到实际请求时读取，因此没有 AI Key 的构建和页面仍可正常工作。

聊天业务按以下边界拆分：

- `app/api/chat/route.ts`：认证、输入校验、限额编排和统一 SSE 响应。
- `features/chat/queries.ts` 与 `access.ts`：显式 `userId` 数据边界。
- `features/chat/utils.ts`：标题、上下文预算、UTC 日界线等纯逻辑。
- `features/chat/components`：历史、消息、Markdown 和流式交互。
- `lib/ai`：配置、错误归一化、SSE 解析和 Provider 注册。

人格业务按以下边界拆分：

- `app/personas`：列表、新建、详情和编辑路由，仅负责鉴权与页面编排。
- `features/persona/queries.ts` 与 `actions.ts`：显式 `userId` 查询和写操作边界。
- `features/persona/schemas.ts`：服务端与客户端共享的字段限制和本地头像白名单。
- `features/persona/prompt.ts`：不调用模型的纯函数 Prompt 构建与预览。
- `lib/ai/prompts/persona-assistant.ts`：基础安全 Prompt 与人格 Prompt 的服务端合并。
- `Conversation.personaId`：新对话一次性绑定；已有对话不能从客户端切换人格。
- `app/api/personas/generate`：登录态、配置和描述校验，编排非流式收集、严格 JSON 解析与最多一次修复，不执行数据库写入。
- `features/persona/generation.ts`：结构化草稿 Schema、JSON 提取、预设头像 ID 映射和未来头像计划纯逻辑。
- `lib/ai/collect-text.ts`：复用 Provider `streamText` 的服务端非流式收集层，不复制 SSE 解析。

### 安全基线

- 用户身份由 Supabase Auth 管理，服务端校验会话。
- 所有业务查询必须包含 `userId` 范围；管理操作额外校验 `ADMIN`。
- AI Key、数据库 URL、service role key 绝不使用 `NEXT_PUBLIC_`。
- 上传文件校验 MIME、尺寸和所有权，使用短时签名 URL。
- 日志不记录完整提示词、访问令牌或 Provider Key。

## 4. Phase 1 任务

1. 初始化 Next.js 15 App Router 与严格 TypeScript。
2. 配置 Tailwind CSS、ESLint 和基础 shadcn 风格组件。
3. 建立 `app/components/features/lib/types/docs` 结构。
4. 实现移动端底栏与桌面侧栏的响应式应用壳层。
5. 实现浅色/暗色系统主题基线与首页骨架。
6. 提供环境变量示例，不创建或提交真实密钥。
7. 归档旧版到 `legacy/streamlit`。
8. 运行 lint、typecheck、build 并记录结果。
