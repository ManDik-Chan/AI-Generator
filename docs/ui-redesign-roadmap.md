# 全站 UI 重构路线图

## Phase 6B1：设计基础、外壳、首页与认证

本阶段建立语义 Token、排版、间距、圆角、阴影、动效、主题系统和共享 primitives；重构 DesktopSidebar、MobileNavigation、MobileHeader、AppShell、首页、登录、注册、账号、404、loading 和全局错误体验。业务 API、数据库、RLS、AI、聊天、人格、记忆与工具语义不变。

已有业务页面会因 Button、Badge、Token 和 AppShell 获得基础视觉提升，但这不代表聊天、人格、记忆和工具页面已经完成最终页面级重构。

## Phase 6B2：核心 AI 工作流

计划对 Chat、Conversation history、Persona 列表/详情/编辑、长期记忆管理进行完整页面级信息架构、交互和响应式重构。必须继续保护 SSE、停止生成、编辑重提、人格绑定、记忆召回和权限隔离。

## Phase 6B3：工具与高级管理体验

计划统一文本工具、图片理解、工具历史、资源状态、复杂 Dialog/Drawer 和管理页面。视觉改造不得改变限额、Storage、ToolRun、隐私开关或 Provider 契约。

Phase 6B2、6B3 尚未开始。Phase 6C 图片生成也不在本轮范围。
