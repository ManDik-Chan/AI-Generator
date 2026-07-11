# 重构进度

## 当前状态

- [x] 现有 Streamlit 项目审计
- [x] 目标架构与迁移策略
- [x] 数据库与部署设计
- [x] Phase 1：项目初始化
- [ ] Phase 2：基础系统
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

### 下一阶段

Phase 2 将引入 Prisma、Supabase Auth/PostgreSQL、用户 Profile 与 ADMIN/USER 权限。真实 Supabase 配置未提供前，代码不得写死或伪造密钥。
