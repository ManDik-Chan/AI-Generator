# 全站 UI 重构路线图

## 统一视觉基准

Phase 6B 以项目所有者批准的 `AI-Generator Premium Rework` 高保真原型为视觉基准。生产代码使用真实 Next.js 路由、真实查询、现有 Server/Client Component 边界和既有业务 API；不复制原型的 hash 路由、假数据、假按钮或 DOM 脚本。

## Phase 6B1：全产品设计基础与页面迁移

第二次视觉验收取消了原先仅迁移首页与外壳的范围限制。当前 `codex/v2-phase-6b1-design-foundation` 已在同一设计系统下完成全部用户可见表面的页面级迁移：

- 语义 Token、纸张/深炭主题、形状、阴影、动效、主题系统和共享 primitives。
- 桌面 rail、移动 header、悬浮 tabbar、真实 Profile 和权限导航。
- 首页、登录、注册、账号、管理员、404、loading 和 error 状态。
- Chat 历史、消息、Markdown、代码、Composer、助手选择和移动抽屉。
- Persona 列表、创建、详情、编辑、实时预览、AI 草稿、AI 头像、删除和恢复。
- Memory 真实容量、状态、语义索引、搜索、筛选、编辑、停用和删除。
- 工具中心、三个文本工具、单图图片分析、工具历史、隐私保留和过期资源状态。

原型中的 ManDik、假对话、假时间、假消息数、假 Persona、网页分析、自定义首页、分享、隐私中心和假快捷键均未迁移。未实现的 PDF/DOCX、专业 OCR、网页/RAG、多图、视频和图片编辑也不会以占位功能出现。

## 兼容性边界

本阶段是 UI/UX 重构，不是业务重开发。认证、权限、SSE、停止生成、编辑重提、Persona 绑定、Memory 召回、ToolRun、Storage、限额、Provider、RLS、Prisma Schema 和数据库 migration 均保持原语义。没有新增或修改 API 路由、migration、数据库表或权限策略。

## 验收状态

本地自动化和九档视口视觉检查已完成，等待项目所有者第三次真实视觉验收。后续 Phase 6B 工作只根据真实验收反馈修正，不再把当前已完成的 Chat、Persona、Memory 或 Tools 迁移延后到新的分支。

Phase 6C 尚未开始。
