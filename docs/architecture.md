# AI-Generator V2 架构设计

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
