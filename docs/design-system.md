# Lumen 视觉设计系统

> Phase 6B3 — Draft。视觉源为项目所有者提供的 `ai-generator-lumen-preview.zip`；生产仓库仍是组件、路由、数据与行为的唯一来源。

## 视觉基准与边界

ZIP 是静态 HTML/CSS/JavaScript 原型，只包含 `index.html` 和两张参考截图。生产实现没有执行原型脚本、复制 mock 数据或引入第二套应用，而是把版式和视觉语法映射到现有 Next.js Server Components、Client Islands、Tailwind 语义类和真实 Supabase/Prisma 数据。

Lumen 定位为安静、清晰、私密的 AI 工作室：浅色是冷白与淡蓝灰画布，深色是接近黑色的蓝灰画布；紫罗兰是主操作，青色用于辅助能力，薄荷用于成功，琥珀用于警告，粉红用于破坏性状态。低对比细边框、克制的玻璃层和局部光晕负责层级，不使用厚重黑影或假霓虹数据。

## 语义 Token

Token 集中在 `app/globals.css`，Tailwind 映射集中在 `tailwind.config.ts`。业务组件只消费语义，不绑定原型颜色名。

| 语义 | 浅色 HSL | 深色 HSL | 用途 |
|---|---:|---:|---|
| `background` | `225 33% 95%` | `225 36% 4%` | 页面画布 |
| `background-subtle` | `224 27% 92%` | `223 29% 7%` | 侧栏、次级底色 |
| `foreground` | `228 29% 9%` | `228 100% 98%` | 主文字 |
| `surface` | `0 0% 100%` | `224 31% 10%` | 面板 |
| `surface-muted` | `225 28% 93%` | `223 25% 14%` | 内嵌区、弱卡片 |
| `primary` | `248 84% 69%` | `248 91% 74%` | 紫罗兰主操作与焦点 |
| `secondary` | `191 96% 54%` | `191 96% 66%` | 青色能力强调 |
| `accent` | `157 75% 53%` | `157 75% 78%` | 薄荷成功与在线状态 |
| `accent-gold` | `39 100% 67%` | `39 100% 72%` | 琥珀提示 |
| `destructive` | `348 78% 54%` | `348 100% 74%` | 删除与失败 |

状态同时使用文字、图标和 `success` / `warning` / `destructive` / `info` subtle surface，不只靠颜色传意。

## 形状、阴影与间距

- Control：`0.75rem`（12 px）。
- Card / Panel：`1.125rem`（18 px）。
- Dialog / Sheet / Display：`1.625rem`（26 px）。
- `shadow-soft`：普通悬浮层；`shadow-raised`：重点卡片与 hover；`shadow-overlay`：Dialog、Sheet 与高层浮层。
- 页面布局使用 Tailwind 4 px spacing scale 和少量语义 CSS 变量；响应式 gutter 使用 `clamp(1.5rem, 3vw, 3rem)`。
- 320 px 手机允许操作组纵向堆叠，不通过无规则负 margin 或固定宽度挤压内容。

## 排版

系统字体栈覆盖 Inter、Apple/Windows UI、苹方和微软雅黑，不提交授权未知字体。公共层级为：

- `text-display`：Hero Display。
- `text-page-title`：页面标题。
- `text-section-title`：章节标题。
- `text-card-title`：卡片标题。
- `text-body` / `text-supporting`：正文与辅助文字。
- `text-label` / `text-caption` / `premium-kicker`：控件、说明与英文 Kicker。
- Markdown/Code 在自己的边界内换行或横向滚动，不制造页面级横向溢出。

邮箱、UUID、URL、连续英文和中文长句使用 `overflow-wrap:anywhere` 或组件级 break 规则。手机输入控件至少 16 px；Viewport 未禁用缩放，自动矩阵额外覆盖 200% 根字体。

## 应用外壳与信息架构

桌面 Sidebar 为 252 px，内容使用真实剩余宽度；顶部 Workspace bar 提供当前路由、主题和 `Ctrl/Cmd + K` 命令搜索。导航分为：

- 工作空间：控制中心、AI 对话、AI 助手、长期记忆。
- 创作实验室：文本工具、图片理解、图片生成、多 Agent 头脑风暴。
- 系统：运行历史、账户与隐私、ADMIN 可见的系统管理。

820 px 及以下使用顶部完整菜单与五项底部主导航；所有未进入底栏的能力仍能从菜单到达。动态 Conversation/Persona 等增长列表关闭详情批量预取，固定导航保留框架预取。

普通页面默认自然 document 滚动。Chat 使用独立固定可视窗口；视口 Token 不进入普通 AppShell。详情见 `mobile-experience.md`。

## 共享组件与业务组件

`components/ui` 提供 Button、表单字段、Page/Section Header、Empty/Status/Skeleton、Dialog、Dropdown、Toast 等无业务 primitive。Lumen surface 组合为：

- `premium-panel` / `premium-panel-strong`
- `premium-subpanel` / `premium-result`
- `premium-field` / `premium-chip`
- `premium-icon-tile`

业务状态继续由各 feature 拥有：Chat 负责消息与恢复，Persona 负责草稿/头像/Apply，Memory 负责搜索/作用域/语义索引，Tools 负责 ToolRun、配额、取消与恢复，Admin 负责服务端角色和运营读模型。视觉层不复制服务端状态到 localStorage。

## 页面映射

- Home：Lumen Hero、真实 Quick Launch、最近对话、真实工作区计数、完整能力入口。
- Auth / Account：玻璃表单、身份/角色/主题/安全边界和真实登出。
- Chat：历史 rail、消息画布、助手选择、独立手机视口和图片理解入口。
- Persona / Memory：保留全部 CRUD、AI 草稿/头像、回收站、自动记忆与语义状态。
- Tools / Image / History：真实 ToolRun、图片私有资产、生成状态、复制/下载/再次创作/删除。
- Brainstorm：四个固定 Worker、真实完成数、超时/失败/取消、协调阶段与综合结果。
- Admin：真实用户、角色、用量、系统状态和受保护操作；不伪造图表。

## 主题、动效与无障碍

主题支持浅色、深色和跟随系统；hydration 前脚本只读取主题偏好。Orbit、float、aurora 与 hover 使用 CSS，`prefers-reduced-motion` 会关闭持续运动和明显位移。所有 icon-only 操作有 `aria-label`，主要触控目标至少 44 px，焦点环可见，错误与异步状态使用语义角色。

## 素材结论

ZIP 无可直接复制的授权字体、独立图片资产或 Logo 文件；两张截图仅用于比对。现有 `favicon.ico`、`icon.png`、`apple-icon.png` 与 AI-Generator 产品名保持不变，没有外部 CDN、巨大 Base64 或重复资产进入构建。
