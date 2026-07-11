# 迁移计划

## 原则

- V2 按阶段交付，每阶段都保持可构建、可回滚。
- 旧版仅作为行为与内容参考，不直接在生产中和 V2 双写。
- 先建立安全边界和数据所有权，再接入真实 AI 能力。
- 不迁移旧版不存在的会话数据；人格与头像采用显式种子迁移。

## 阶段

### Phase 1：项目初始化

- Next.js 15、React、严格 TypeScript、Tailwind、ESLint
- 共享 UI 基础组件和响应式导航壳层
- 旧版归档、架构文档、环境变量模板
- 验收：lint、typecheck、build 全部通过

### Phase 2：基础系统

- Prisma schema 与 Supabase PostgreSQL
- Supabase Auth 注册、登录、退出、会话刷新
- User/Profile 与 ADMIN/USER 权限
- 数据访问层和 RLS 策略说明
- 验收：用户只能访问自己的数据，管理员路由受保护

### Phase 3：AI 聊天

- Conversation/Message CRUD
- 服务端统一 AI Gateway 与首个 Provider
- 流式响应、Markdown、代码高亮、历史与删除
- 验收：刷新后历史仍存在，客户端看不到 API Key

### Phase 4：人格系统

- Persona 创建、编辑、删除和头像
- 由结构化字段生成 system prompt
- 聊天选择人格并保存关联
- 迁移经审核的旧人格模板为可选种子数据

### Phase 5：记忆系统

- Memory CRUD、重要度和分类
- 用户明确授权的自动提取/确认流程
- 聊天上下文按预算检索记忆
- 验收：记忆可查看、编辑、删除和关闭使用

### Phase 6：工具箱

- 写作、润色、总结、翻译共用文本任务管线
- 图片上传与理解
- 图片生成与历史（仅 API Provider）
- 文件处理设置大小、格式、保留期限制

### Phase 7：优化与部署

- PWA manifest、图标、安装与离线降级页
- 移动端触控、无障碍、性能和错误监控
- Vercel/Supabase 部署演练与恢复文档

## 旧版映射

| 旧版内容 | V2 去向 | 策略 |
| --- | --- | --- |
| `api_clients.py` | `lib/ai` | 只迁移接口思想，重写服务端实现 |
| `character_templates.py` | Persona seed | 内容审核后结构化导入 |
| `assets/avatars` | Storage/public seed | 压缩、校验版权后迁移 |
| `content_assistant.py` | `features/tools` | Phase 6 重新实现 |
| PDF/DOCX/图片解析 | `features/tools` | Phase 6 按服务端安全限制重写 |
| 医疗/法律/合同/旅行页面 | 无 | 归档，不进入核心版本 |
| Streamlit session memory | 无 | 不可持久化，不迁移 |

## 回滚与完成定义

每个阶段使用独立、可审阅的变更集。若阶段失败，保留前一阶段可运行版本；数据库迁移必须同时提供向下迁移或明确的前滚恢复步骤。阶段完成必须满足：lint、typecheck、build 通过，文档与环境变量清单同步更新，且没有真实密钥进入仓库。
