# 重构进度

## 当前状态

- [x] 现有 Streamlit 项目审计
- [x] 目标架构与迁移策略
- [x] 数据库与部署设计
- [x] Phase 1：项目初始化
- [x] Phase 2：基础系统
- [ ] Phase 3：AI 聊天
- [ ] Phase 4：人格系统
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
