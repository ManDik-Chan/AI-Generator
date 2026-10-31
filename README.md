# AI-Generator

**A full-stack AI workspace built with Next.js, TypeScript, Supabase and Prisma.**

一个持续迭代的全栈 AI 工作平台：将流式对话、自定义 AI 人格、可信长期记忆和实用 AI 工具整合到统一工作台，并探索多 Agent 协作与可扩展的应用架构。

[项目网站](https://www.ai-mdc.com) · [源代码](https://github.com/ManDik-Chan/AI-Generator) · [技术架构](docs/architecture.md) · [本地部署](#本地运行)

> **项目状态：持续开发 / Work in Progress。** 仓库中已实现的模块不代表线上部署全部通过验收。部分功能需要正确配置认证、数据库、模型服务及私有存储。多 Agent、项目 Registry 等新能力仍在独立分支或验收阶段，不应视为已上线功能。

## 项目简介

AI-Generator 从早期 Python / Streamlit 原型逐步迁移至基于 Next.js App Router 的模块化全栈应用。项目关注的不只是模型调用，还包括真实用户在 AI 产品中需要的登录、数据隔离、流式响应、人格配置、记忆治理、异步任务与跨设备交互。

**核心目标：** 在一致的产品体验下，让不同 AI 能力复用认证、Provider、数据、权限和交互基础设施，而不是为每一种能力制作互不相连的页面。

## 主要功能

| 模块 | 功能与实现 | 当前状态 |
| --- | --- | --- |
| AI 对话 | 流式消息、会话历史、Markdown / 代码渲染，服务端 OpenAI-compatible Provider | 已实现，依赖模型配置 |
| 自定义人格 | 人格创建与管理、AI 辅助生成草稿、会话人格绑定 | 已实现 |
| 长期记忆 | 用户确认的记忆提案、作用域隔离、关键词与 Embedding 混合召回 | 已实现，依赖数据库与向量配置 |
| 文本工具 | 总结、改写、翻译及工具历史 | 已实现 |
| 视觉工具 | 单图图片理解、文生单图、私有资源存储与访问控制 | 已实现，依赖服务配置 |
| Agent 协作 | 多 Worker 推理编排、协调器及任务生命周期探索 | Draft / 验收中；非通用代码执行 Agent |
| 平台 Registry | 面向后续平台化的项目与资源数据模型、安全边界 | 开发分支中，尚未完成安全验收 |
| 可运行 Demo | 服务端路线优化求解器（JSON / SSE 运行接口）与浏览器内神经网络训练（Web Worker），无需登录 | 已实现，Demo 专用接口，按实例限流 |
| 开发者文档 | 开发者手册、API Reference、Manifest 与能力描述符、接口清单，OpenAPI 3.1 规范由代码生成 | 已实现，见 [docs/developer](docs/developer/README.md) |

## 技术栈

- **前端：** Next.js 15 (App Router)、React、TypeScript、Tailwind CSS
- **交互与视觉：** 响应式组件体系、GSAP、Radix UI 相关组件
- **后端与数据：** Next.js Route Handlers / Server Actions、Prisma、PostgreSQL、Supabase Auth / Storage
- **AI 接入：** 服务端 OpenAI-compatible Provider、流式响应、Embedding 语义检索
- **质量保障：** ESLint、TypeScript、Vitest、Playwright、GitHub Actions
- **部署：** Vercel，线上环境需单独配置密钥和数据库

### 结构概览

```text
Browser
  └─ Next.js App Router
      ├─ app/             路由、页面、API
      ├─ components/      共享 UI 与应用框架
      ├─ features/        Chat / Persona / Memory / Tools / Landing
      ├─ lib/             Auth / AI Provider / Database / Storage
      ├─ prisma/          Schema 与版本化数据库迁移
      └─ tests/           单元、集成及 E2E 测试
            │
            ├─ Supabase Auth + PostgreSQL + private Storage
            └─ OpenAI-compatible AI Providers
```

## 关键工程实践

**模块化演进。** 从 Streamlit 原型迁移至 Next.js 全栈架构，拆分产品路由、业务模块、共享服务及数据层，降低后续扩展新 AI 工具的耦合度。

**可信记忆。** 区分模型提案与用户确认的正式记忆；采用关键词和向量混合召回，并为不同用户、人格作用域和数据资源设置隔离边界。

**流式与异步执行。** 对话和工具围绕服务端流式输出、运行状态、停止与恢复机制设计；多 Agent 部分仍处于功能验收中。

**安全与验证。** 敏感 Provider Key 仅在服务端读取，数据库和存储访问按用户范围校验；对迁移、RLS 与集成流程保持独立测试与验收，不因 UI 演示完成而宣称安全验收通过。

## 演示与截图

- [项目站点：ai-mdc.com](https://www.ai-mdc.com)（请以实际部署状态为准）
- 建议演示路径：**Landing → 登录 → Workspace → AI 对话 → 工具工作台**。
- 项目截图将在演示版本视觉验收后补充，避免使用设计稿冒充实际运行画面。
- 未开放体验账户时，请勿将私人的登录信息、API Key 或后台配置写入仓库。

## 本地运行

**环境要求：** Node.js 22.x LTS、pnpm 11.7.0；PostgreSQL / Supabase 与模型配置按具体功能准备。

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。复制 `.env.example` 为 `.env.local` 并按需填写环境变量。禁止将真实密钥提交至 GitHub。

需要数据库迁移、认证或 AI Provider 设置时，参见：

- [认证与数据库](docs/authentication.md)
- [AI Provider](docs/ai-provider.md)
- [部署说明](docs/deployment.md)
- [整体架构](docs/architecture.md)

### 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Registry B2-A 的 DTO / JCS 定向单测：

```bash
pnpm exec vitest run features/registry/canonical.test.ts features/registry/contracts.test.ts
```

跨语言哈希验证需在独立目录准备固定 commit 的 RFC Python 参考实现，然后运行 `python3 scripts/verify-registry-jcs.py --reference-root <reference-checkout>`。完整 fetch 命令、31 个固定向量和范围见 [Registry B2-A 契约说明](docs/registry-b2a-contracts.md#固定向量与跨语言验证)。CI 的 `Registry JCS Python reference` 独立任务执行同一验证，失败不会跳过。

## 当前开发方向

1. 打磨独立可展示的产品主页、工作台和响应式体验。
2. 强化多 Agent 执行、恢复、可观测性与真实运行验收。
3. 在安全与迁移验收完成后推进项目 Registry 等平台化模块。

历史设计决策、阶段验收和深入技术文档保留在 [docs/](docs/)；旧版 Streamlit 原型位于 [legacy/streamlit/](legacy/streamlit/)。

---

*AI-Generator is an evolving personal full-stack project. Feature availability and deployment status may change between branches and environments.*
