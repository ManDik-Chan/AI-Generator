# Phase 6B1 全产品 Premium UI 迁移

## 目标与边界

本次在同一 `codex/v2-phase-6b1-design-foundation` 分支中，把已批准的 Premium 视觉语言扩展到所有用户可见产品表面。它只改变布局、视觉层级、响应式呈现和无障碍反馈，不改变业务规则、数据来源或运行架构。

明确未修改：认证与权限、聊天 SSE、停止和编辑协议、Persona Prompt、Memory 提取/召回、ToolRun 终态、Storage、限额、Provider、API 路由、Prisma Schema、RLS 和 migration。

## 路由与组件映射

| 产品表面 | 路由 | 主要生产组件 | Premium 布局 |
| --- | --- | --- | --- |
| 首页与应用壳 | `/`、全局 protected routes | `AppShell`、`DesktopSidebar`、`MobileNavigation` | 桌面 rail、移动 header 与悬浮 tabbar |
| Chat | `/chat`、`/chat/[conversationId]` | `ChatLayout`、`ConversationList`、`MessageList`、`ChatComposer`、`AssistantSelectorPanel` | 桌面三栏、平板收栏、手机单栏与抽屉 |
| Persona | `/personas`、`/personas/new`、详情、编辑、回收站 | `PersonaCard`、`PersonaCreation`、`PersonaForm`、`PersonaPreview`、`AiAvatarDialog` | Assistant Studio 卡片、分段编辑器、桌面实时预览 |
| Memory | `/memories` | `MemoryManager`、`MemoryFormDialog` | 真实治理概览、搜索筛选、响应式记忆卡片 |
| 文本工具 | `/tools`、总结、改写、翻译 | `ToolPage`、`ToolRunner` | 输入与结果双工作区，手机纵向堆叠 |
| 图片理解 | `/tools/image` | `ImageAnalyzer` | 安全上传工作区、真实视觉额度与结果工作区 |
| 工具历史 | `/tools/history` | `ToolHistory` | 真实筛选、详情、过期资源和继续编辑 |
| 账号与管理 | `/account`、`/admin` | 既有账号/管理组件与共享 UI | 统一 PageHeader、Surface、状态与权限呈现 |

## 真实数据原则

- 首页最近对话、Persona、Memory 容量和语义索引、视觉额度、ToolRun 与 ToolAsset 状态均来自既有查询。
- 无数据时使用高质量 EmptyState，不补造时间、数量、头像、对话、模型调用或管理统计。
- 内部治理字段不因视觉设计暴露给普通用户；例如 Memory `topicKey` 仍只用于召回治理。
- 原型中未实现的网页分析、自定义首页、分享、PDF/OCR/RAG 等能力没有可点击占位入口。

## 响应式与主题

本地浏览器检查覆盖 390、430、520、768、820、1024、1180、1440 和 1920px。Chat、Persona Builder、Memory、文本工具、图片分析和历史均无水平溢出；手机 Composer 与悬浮导航使用安全区留白，桌面宽屏维持可读行宽和稳定侧栏。

浅色、深色和跟随系统继续由既有主题机制控制。所有新增表面使用语义 Token；`prefers-reduced-motion` 会关闭非必要旋转、漂浮和位移。图标按钮提供可访问名称，输入保持 label，键盘焦点使用统一 `focus-visible`。

## 视觉验收清单

1. 首页、认证、账号和管理员页面与产品工作区使用同一品牌、Token 和导航。
2. Chat 在生成、停止、编辑、错误和已删除 Persona 状态下不改变业务行为。
3. Persona 的预览只反映当前真实表单值，AI 草稿和头像 Dialog 不制造保存成功状态。
4. Memory 数量、容量、索引和使用时间均可追溯到真实数据。
5. 工具的隐私开关、额度、停止、复制、下载、资源过期和历史操作保持可用。
6. 九档宽度无水平溢出；手机触控目标、键盘焦点和主题切换可用。
7. 页面中没有旧式 `bg-card` 灰框系统、假数据或未实现功能入口。

## 当前状态

全产品 UI 迁移和本地视觉/自动化检查已完成，等待项目所有者第三次真实视觉验收。Phase 6C 尚未开始。
