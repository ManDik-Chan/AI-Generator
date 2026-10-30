# 平台化展示修正 · 2026-10-29

分支 `codex/platform-showcase-20261029`，基于 PR #33 集成提交 `99a2b8c`。视觉基线为 PR #32 之前、已获 Owner 验收的 `main@0e13d32`。本轮不是 UI 重设计。

## 1. Hero 与主页视觉：恢复到 `0e13d32`

| 文件 | 与 `0e13d32` 的差异 |
|---|---|
| `features/landing/landing.css` | 无差异 |
| `features/landing/components/landing-runtime.tsx` | 无差异 |
| `features/landing/components/primitives.tsx`、`features/landing/art.ts` | 无差异 |
| `features/landing/components/landing-page.tsx` | 仅 1 处：Agent 章节目录卡链接 `/agents` → `/platform/agent`（公开访客不再被引到登录页） |
| `features/landing/content.ts` | 仅文案（见第 2 节），字段结构与基线相同 |

撤销的 PR #32 改动：

- Hero 新增的「开始体验 / 查看源码」两个按钮，及 `hero__stack`、`hero__cta`、`hero__source` 样式；
- Hero 卡片避让区放大（`170px`、`17% → 22%` 视高）；
- 预加载时间：最短 `1600ms → 1100ms`、资源等待 `4500ms → 2800ms`、`4000ms` 强制结束；
- 浅色区域 Header 渐变遮罩（`data-surface`）；
- 目录卡「开发中」徽章样式（`.dev-badge`）；
- `max-width: 960px and min-height: 740px` 移动端章节插图布局；
- About 区 meta 文案字段。

Hero 标题「懂你所想，守你所藏。」、浮动卡片内的气泡与标签文字均保持基线原文。PR #32/#33 中 Workspace 导航、Tools、运行时、脚本、测试与文档成果保持不变。

## 2. 主页文案：产品重新定位

只改文字和链接目标，不增减区块、章节数、按钮或动效。

| 位置 | 旧 | 新 |
|---|---|---|
| Meta / 预加载 | 私人 AI 助手平台 / 私人 AI 工作室 | 统一 AI 工作平台 |
| Header 4 个导航 | 对话 · 助手 · 工具 · 记忆 | 平台 · 项目 · Agent · Skills（指向 `/platform`） |
| 移动菜单 6 项 | 6 个 AI 功能 | 平台总览 · 项目 · Agent · Skills · AI 对话 · AI 工具 |
| Hero 底部说明 | 私人 AI 助手平台 / 对话 · 人格 · 记忆 · 创作 | 统一 AI 工作平台 / 工作台 · 项目 · Agent · Skills |
| 五个章节 | 核心能力；对话 / 人格 / 记忆 / 图片 / 多 Agent | 平台能力；对话 / 人格 / 记忆 / 工具 / Agent（目录卡标「开发中」） |
| About 段落 | 私人助手理念 | Workspace、Projects、Agent、Skills 与 Chat、Persona、Memory、Tools 的平台叙事 |
| About 卡片 | 最近更新（Phase 编号） | 发展方向：Projects（开发中）、Skills（规划中） |
| 能力卡 / 索引 | 新近能力 / 完整工作空间 | 已上线能力 / AI Hub · 平台基础能力（链接到 `/platform/*`） |
| Forest、流程、结尾、页脚 | 私人工作室叙述 | 平台定位；Skills、Projects 明确写为「将」；页脚新增「平台预览」栏 |

中英文同步修改。根布局默认描述同步改为平台定位。

## 3. 能力状态（以代码与文档为准）

| 模块 | 状态 | 依据 |
|---|---|---|
| Workspace 个人工作台 | 已上线 | `app/(platform)/workspace` |
| Chat / Persona / Memory / Tools | 已上线 | 现有路由与功能 |
| Agent 模式 | 开发中 | `docs/agent-mode.md`：Phase 7A1.1 Draft |
| Projects Registry | 开发中 | PR #29 草案；P0.5 契约；未部署、无 UI |
| Skills | 规划中 | 仓库内无设计或代码 |
| 项目展示、开发者控制台、BYOK、远程端点 | 规划中 | 平台路线图 v1.0 / P0.5 |

## 4. 公开只读平台预览 `/platform`

`app/platform/*` + `features/platform-preview/*`。独立的预览壳层沿用工作台的侧边栏、顶栏、移动端头部与底部导航样式，不读取会话、Supabase 或数据库；所有页面构建时静态预渲染，不设置 Cookie。每页顶部有「演示预览」说明，示例区块标注「示例数据」。

| 路由 | 内容 |
|---|---|
| `/platform` | 统一控制台：平台模块、AI Hub、示例项目与运行、发展方向 |
| `/platform/projects`、`/[slug]` | 项目列表（按可见性筛选）、发布流程、8 个 Registry 实体；详情含工作空间结构、成员角色、资产状态、版本发布、项目内运行 |
| `/platform/agent`、`/[runId]` | 运行模式（真实设计限制）、执行阶段、Worker 状态、示例运行；详情复用真实 `AgentWorkerCard` |
| `/platform/skills`、`/[slug]` | 能力目录、管理表、单个 Skill 的启用/范围/权限（仅本页切换，不保存） |
| `/platform/chat` | 复用真实 `MessageItem`，含记忆引用展示 |
| `/platform/personas`、`/memory`、`/tools` | 复用 `PersonaAvatar`、记忆分类与核对标签；工具卡链接到真实工具 |

入口：主页 Header、移动菜单、About 卡片、索引列表、Agent 目录卡、页脚。真实 `/workspace`、认证、中间件与业务接口未改动。

## 5. 验证

- `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；`pnpm test`：150 个文件 / 863 个测试通过，7 个需数据库的集成文件按原样跳过。
- HTTP 冒烟（`next start`，无浏览器）：主页中英文与 17 个 `/platform` 页面返回 200（构建共预渲染 25 个 `/platform` 页面） 并包含预期文字；主页不含 `hero__cta`、「开始体验」「查看源码」；`/workspace`、`/chat`、`/agents` 仍 307 跳转登录；未知项目 404；`/platform` 不设置 Cookie；42 个内部链接全部可达。测试服务器已按 PID 结束并确认端口释放。
- 浏览器截图：Owner 于 2026-10-29 明确授权本任务使用一个受控浏览器实例。见第 6 节。

## 6. 桌面与移动端截图（受控单实例）

截图位于 [`screenshots/platform-20261029/`](screenshots/platform-20261029/)，对应提交 `08eb37d` 的 `next start` 生产构建，共 42 张。

| 前缀 | 视口 | 内容 |
|---|---|---|
| `desktop-landing-zh-01…09` | 1440×900 | Hero、对话 / 工具 / Agent 章节、About、已上线能力、AI Hub 索引、Forest、页脚 |
| `desktop-landing-en-01` | 1440×900 | 英文 Hero |
| `desktop-platform-01…11` | 1440 宽整页 | 控制台、项目列表与详情、Agent 与运行详情、Skills 与详情、Chat、Personas、Memory、Tools |
| `mobile-landing-zh-01…10`、`mobile-landing-en-01` | 390×844 @2x，触屏 | 同上主页位置 + 移动菜单 |
| `mobile-platform-01…12` | 390 宽整页（缩放为 1.5x 存储） | 9 个平台页面 + 平台预览菜单 |

对照：PR #32 留下的 [`screenshots/landing-desktop-hero.jpg`](screenshots/landing-desktop-hero.jpg) 中标题下方有「开始体验 / 查看源码」两个按钮；新截图 `desktop-landing-zh-01-hero.jpg` 中已恢复为基线的纯标题布局，底部说明为平台定位文案。

运行记录（遵守 `AGENTS.md`）：

- 一次 `launchServer`（已安装 Edge，headless，Playwright 临时资料目录），一个浏览器内先后一个桌面、一个移动上下文，各一页；一次性锁文件防止重复启动；无重试。
- 启动前内存 56.7%，峰值 58.9%；自有 Edge 进程峰值工作集 892 MiB。
- 0 个失败步骤、0 个页面错误、0 条控制台警告或错误；所有截图的页面横向溢出为 0。
- 关闭后核对：12 个自有进程（按 PID + 创建时间记录）全部退出，根进程退出码 0，临时资料目录已删除；用户自有 Edge 进程未被触碰（其中一个在运行前几秒新建的用户子进程自行结束，脚本不操作非自有进程）。应用服务器按 PID 结束，端口释放。

截图中观察到的情况：

- 以下为 `0e13d32` 基线原有表现，按「禁止未经授权继续优化」保持不变：手机上 Hero 随机卡片偶尔会压到标题；滚动到 About / 结尾时 Header 与正文重叠；手机章节不显示插图。PR #32 针对这些的改动已撤销，如需调整请另行授权。
- 新增页面：截图中 Skills「管理」表在手机上需在表格内横向滑动才能看到「底层能力」「启用」两列（页面本身不溢出）。截图之后的提交已将其改为响应式列表：手机上每项分三行（名称与开关、权限、底层能力），640px 以上仍为四列。该修改通过 lint / typecheck / build / 单元测试，**未重新截图**（浏览器授权仅限上一次运行），`desktop-platform-06-skills.jpg`、`mobile-platform-06-skills.jpg` 显示的是修改前的表格。
- 整页截图中固定定位的侧边栏 / 底部导航只按首屏位置渲染，真机上分别固定在屏幕左侧和底部。

未修改数据库、Prisma migrations、Supabase 配置、Provider、环境变量或 Vercel 配置；未合并 main，未部署。
