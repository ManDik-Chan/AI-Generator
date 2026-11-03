# 交接：P1-F1 平台体验闭环（Claude，2026-11-03）

> 分支 `claude/p1-f1-experience-loop-20261103`，基于 `main` `77019ba`（PR #54 合并提交）。
>
> 未修改：Registry 后端、数据库、迁移、RLS、Auth / Session / middleware、Provider、CI 工作流、`features/platform/source.ts`、`/admin` RBAC、依赖与 lockfile、`next.config.ts`。落地页只改了页脚一列的标题文字，组件、CSS 与动效未动。
>
> 浏览器：按 `AGENTS.md`，未启动或连接任何本地浏览器，未截图、未录屏、未运行本地 E2E。渲染结果通过读取 `pnpm build` 预渲染出的 HTML 核对（第 4 节）。

## 1. 审核方法

1. 新增单元测试 `components/layout/site-links.test.ts`：从 `app/`、`components/`、`features/` 源码中收集所有站内链接（`href` 属性与字段、页脚 `["标签", "/路径"]` 元组），逐条对照 `app/` 实际路由树（去掉路由组，动态段按页面预渲染所用的同一份数据核对 slug），带 `#锚点` 的链接对照开发者文档标题生成的 id 或源码中的元素 id。
2. 对 Landing → Demo → 文档 → 平台 → 工作台各页面逐一阅读，检查入口是否能完成、去向是否可达、数据性质是否如实标注。

## 2. 发现与处理（变更前后对照）

| # | 位置 | 变更前 | 变更后 | 类别 |
| --- | --- | --- | --- | --- |
| F1 | `/demos/neural-network` →「能力描述符」 | 链接到 `/docs/api#capabilities`，文档中没有该锚点，只停在页面顶部 | 指向 `/docs/api#capabilitydescriptor`（“CapabilityDescriptor”小节） | 断链 |
| F2 | 两个 Demo 页底部 | 只链接到接口文档与源码。Explore 项目页、研究记录都能进入 Demo，但 Demo 无法回到它们，也没有回到平台的入口（只能靠页头） | 新增「运行之后」区块，四个入口：项目页 `/explore/{slug}`、研究记录 `/research/{slug}`、接口文档、演示工作台 `/platform`；标题右侧「全部 Demo」。样式沿用 `/demos`「更多实验室」的卡片 | 闭环缺口 |
| F3 | 工作台外壳（`/workspace` 等登录后页面与 `/platform` 演示工作台共用） | 页脚只有「官网 / 探索项目 / GitHub」，⌘K 面板只有平台模块；从工作台无法到达 Demo 与开发者文档 | 页脚增加「运行 Demo」「开发者文档」；⌘K 面板新增「公开页面」组：运行 Demo、开发者文档、官网 | 闭环缺口 |
| F4 | 公开页头（Explore / Research / Demo / Docs） | 激活状态用前缀匹配，`/platform/hub` 会同时点亮「演示工作台」与「AI Hub」；手机菜单没有 `aria-current` | 只点亮最具体的一项；手机菜单当前项有 `aria-current="page"` 与底色 | 导航状态 / 可访问性 |
| F5 | 404 页 | 唯一按钮「返回工作台」→ `/workspace`；未登录访客（多数 404 来自公开链接）会被带到登录页 | 主按钮「返回官网」，次按钮「返回工作台」；标题文字不变 | 错误反馈 |
| F6 | 全局错误页 | 「重试」「返回工作台」 | 增加「返回官网」 | 错误反馈 |
| F7 | 路线优化 Demo 网络错误提示 | HTTP 错误有 `role="alert"`，网络中断 / 事件流断开的提示没有，读屏不会播报 | 两者都有 `role="alert"` | 可访问性 |
| F8 | 落地页页脚、公开页页脚「AI Hub」一列 | 对话、人格、记忆、工具都是需要登录的真实功能，但未标注；同一页头的「AI Hub」胶囊去的是演示版 `/platform/hub` | 列标题改为「AI Hub · 登录后使用」/「AI Hub · sign-in required」；链接不变（未登录会经 `?next=` 登录后回到原页） | 标注 |

审核中确认**无需修改**的点：

- 全站静态链接、Explore / Research / 版本页 / 演示 Agent 等动态 slug 全部可达（测试覆盖）。
- 登录保护页对未登录访客由 middleware 重定向到 `/login?next=…`，登录后回到原页。
- 演示工作台每页有绿色说明条；`/projects`、`/connections` 等登录后页面使用 Fixture 时都有“Registry 尚未部署 / 示例项目 / 不会保存”说明；开发者控制台 Mock 与 Registry 只读模式分开布局，各自标注。
- Demo 的 HTTP 错误（含 429 `Retry-After`、校验 issues、requestId）已有明确反馈。

## 3. 路由与入口清单

数据性质：**真实**（服务端身份校验 + 真实数据库 / Provider）· **真实执行**（真实计算，不涉及账户数据）· **示例**（Fixture / 浏览器内模拟，页面已标注）· **只读**（Registry 只读接口，开关默认关闭）· **未实现**（规划中，页面已标注）。

### 公开（无需登录）

| 路由 | 内容 | 数据性质 | 主要出口 |
| --- | --- | --- | --- |
| `/` | 官网（中 / 英） | 静态内容 | Explore、Demo、文档、演示工作台、登录 / 注册 |
| `/demos` | Demo 目录、两种接入方式对比 | 静态内容 | 两个 Demo、手册、API Reference、更多实验室 |
| `/demos/route-optimizer` | 路线优化：服务端求解，JSON / SSE | **真实执行**（`POST /api/demo/v1/runs`，限流 + 5 s 截止，不落库） | 接口文档、源码、**运行之后**（本 PR） |
| `/demos/neural-network` | 神经网络：Web Worker 训练 | **真实执行**（浏览器内，不上传） | 同上 |
| `/api/demo/v1/*` | capabilities、runs、openapi.json | **真实执行** | — |
| `/docs`、`/docs/guide`、`/docs/api`、`/docs/manifest`、`/docs/status` | 开发者文档（读取 `docs/developer/*.md`） | 静态内容；文档内按“Demo 可调用 / 已实现 / 内部 / 设计契约”标注 | 两个 Demo、openapi.json |
| `/explore`、`/explore/[slug]`、`/explore/[slug]/release` | 公开项目目录、项目页、版本页预览 | **示例**（Registry 未部署；版本页标注 Fixture） | Demo、研究记录 |
| `/research`、`/research/[slug]`、`/research/[slug]/[experiment]` | 研究记录、实验 | **示例**记录；可复现实验的参考结果在构建时由仓库代码计算，浏览器可重算 | Demo、项目页 |
| `/platform` 及其下全部页面 | 演示工作台：项目、开发者控制台、连接与授权、AI Hub、Agent | **示例**（页顶说明条：不连接任何账户） | 登录真实工作台、官网、Explore、Demo、文档（本 PR） |
| `/login`、`/register` | 登录 / 注册 | **真实**（Supabase Auth） | 演示工作台、官网 |

### 登录后

| 路由 | 内容 | 数据性质 |
| --- | --- | --- |
| `/workspace`、`/hub` | 工作台主页、AI Hub 概览 | **真实**（问候、用量、最近活动）；“我的项目”一栏为**示例**并已标注 |
| `/chat`、`/personas`、`/memories`、`/tools/*`、`/tools/history` | 对话、人格、记忆、工具、运行历史 | **真实** |
| `/agents` | Agent 多 Worker 运行 | **真实**，标注「开发中」 |
| `/projects`、`/projects/new`、`/projects/[slug]` | 项目 | **示例**（Registry 写接口未接入；页面说明不会保存） |
| `/developer`、`/developer/integrate`、`/developer/access`、`/developer/projects/[slug]` | 开发者控制台 Mock 模式 | **示例**（浏览器内 Mock，每屏标注） |
| `/developer/registry`、`/developer/registry/projects/[id]` | 开发者控制台 Registry 模式 | **只读**；三个读取开关默认关闭，关闭时显示服务端真实的 DISABLED 状态 |
| `/connections` | 连接与授权（BYOK / Grant） | **未实现**，标注「规划中」，展示示例 |
| `/account` | 账户与隐私 | **真实** |
| `/admin` | 系统管理与角色 | **真实**（仅管理员；本 PR 未触碰） |

## 4. 测试与验证

本地（Windows，Node 22，未启动浏览器），head 见 PR：

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过（0 warning） |
| `pnpm test` | 208 个文件 / 1637 项通过；16 个 Supabase 集成测试文件按环境跳过 |
| `pnpm build` | 通过；`/demos/*`、`/platform` 仍为静态预渲染 |

新增测试：

- `components/layout/site-links.test.ts`：全站站内链接与锚点可达性（变更前即发现 F1）。
- `components/layout/experience-loop.test.ts`：闭环的每一跳（落地页 → Demo → 文档 → 平台；工作台 → Demo / 文档；Demo → 项目页 / 研究记录 / 文档 / 平台；404 / 错误页出口；需登录链接的标注）与页头激活规则。
- `tests/e2e/mobile/experience-loop.spec.ts`（CI 三个 Playwright 项目执行，本地未运行）：只用 HTTP 请求，以未登录身份抓取生产构建，核对上述链接与锚点出现在实际 HTML 中、未知页面返回 404 且带回官网入口。不抓取 `/explore`、`/research` 详情页（CI 全局登录后共享服务器对这些页面返回 404，见 2026-11-02 public-meta 交接）。

构建产物核对（读取 `.next/server/app/*.html`）：两个 Demo 页含 `/explore/{slug}`、`/research/{slug}`、对应文档锚点、`/platform`、`/demos`；神经网络页指向 `/docs/api#capabilitydescriptor`，且 `docs/api.html` 含该 id；`platform.html` 含 `/demos`、`/docs`；`_not-found.html` 含「返回官网」与 `href="/"`。

## 5. 未验证与需要 Owner 亲自验收

本地没有任何浏览器验证。以下页面需要 Owner 在 Preview 上目测（宽度建议 390 / 1440，含深色模式）：

1. `/demos/route-optimizer`、`/demos/neural-network`：页面底部「运行之后」四张卡片的排布（≥1181px 四列，640–1180px 两列，手机单列）与悬停效果。
2. `/platform`（或任一登录后页面）：页脚新增的两个链接在窄屏下的换行。
3. 任一工作台页面按 ⌘K / 点击搜索：列表末尾「公开页面」组。
4. `/explore` 或 `/docs` 在手机宽度打开站点菜单：当前项高亮。
5. 任意不存在的地址（如 `/demos/x`）：404 页两个按钮。
6. 落地页（中 / 英）与公开页页脚：「AI Hub · 登录后使用」列标题宽度。

## 6. 未处理与建议

- 落地页右下角悬浮按钮「快速开始对话」→ `/chat`，未登录时会先到登录页；属于落地页既有设计，本轮未改。
- 登录后的 `/projects` 与 `/connections` 仍展示示例数据（已标注）。真实数据需等 Registry 写接口与 Grant / Credential 服务，另开任务，改动集中在 `features/platform/source.ts`。
- 演示工作台没有「运行历史」与「账户」对应页面，导航中按设计隐藏，未补。
