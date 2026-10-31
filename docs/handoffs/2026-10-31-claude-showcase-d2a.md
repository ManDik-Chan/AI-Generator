# 交接：P1-D2-A Showcase 最小交付（Claude，2026-10-31）

> 分支 `claude/p1-d2a-showcase-20261031`，基于 `origin/main` `5990f79`（含 PR #39 开发者控制台）。独立 worktree。不依赖未合并的 PR #40。
> 未改数据库、RLS、Auth、Registry、后端安全核心；未接入真实 Release API；未启动浏览器、未截图；未合并 main，未部署。

## 1. 交付内容

现状：`/explore` 与 `/explore/[slug]` 已经是完整的项目页（概览、实验室、架构、基准、文档、版本），数据来自平台自己的 `PlatformProject` 示例模型；两个真实 Demo 在 `/demos/*`，并通过 `LaunchLab` 接入项目页的实验室标签。缺的是 **Registry 公开发布格式（`ReleaseDTO`）的展示**：B2-B 合并后，公开投影将以 `ReleaseDTO` 的形式出现（presentation 区块、研究声明、文档），但仓库里没有任何组件能渲染它。

本次只补这一块，不重复已有功能：

| 新增 | 内容 |
| --- | --- |
| `/explore/[slug]/release` | “版本页预览”：按 `ReleaseDTO` 渲染路线优化求解器与神经网络训练场的发布页。其他 slug 一律 404，页面 `noindex` |
| `features/showcase/releases.ts` | 两份 `ReleaseDTO` 形状的 Fixture，加上来源说明、站内文档链接；`getShowcaseRelease(slug)` 是唯一数据入口 |
| `features/showcase/components/release-showcase.tsx` | 发布页：Hero、Fixture 声明、按顺序渲染 `presentation.sections`（MARKDOWN / IMAGE / BENCHMARKS）、研究声明、真实 Demo 实验室、发布信息、文档、公开规则 |
| `features/showcase/components/release-markdown.tsx` | 项目作者写的 Markdown 的受限渲染：不渲染原始 HTML、不渲染图片、标题从 h3 起、链接按不可信外链打开 |
| 项目页链接 | 两个真实 Demo 的项目页 Hero 增加「版本页预览 · Fixture」按钮（`ProjectShowcase` 新增可选 `releasePreviewHref`，其他项目不显示） |

设计语言沿用项目页：全幅艺术图 Hero、圆角卡片、标签式徽标、右侧粘性信息栏；没有新增全局样式或依赖。

## 2. Fixture 边界

- 数据只来自 `features/showcase/releases.ts`，**不调用任何 Registry 函数或接口**。页面首屏下方第一条就是「Fixture · 未发布」声明，说明公开读取目前返回 `NOT_FOUND`、这不是已发布的 Release；Hero 同样标注「Fixture · 未发布」。
- `publishedAt` 是 schema 要求的必填字段，Fixture 中只是占位值；页面从不显示它，也不出现“发布于”。
- 内容如实：研究声明只用 `SOURCE_IMPLEMENTED` / `DOCUMENTED` / `PLANNED`（`EXPERIMENT_VERIFIED` 需要证据资产）；所有基准指标为 `UNPUBLISHED`，页面不显示任何数字。
- 资产（IMAGE 区块、文档）还不能分发：页面显示“资产尚未开放分发”和替代文本；文档另给站内可读版本的链接。
- 可运行的部分是真实的：「运行真实 Demo」与实验室区块复用现有 `LaunchLab`，直接进入 `/demos/route-optimizer`、`/demos/neural-network`。

## 3. 验证（Node 22 / pnpm 11.7.0，Windows）

见第 8 节的最终结果。新增 `features/showcase/releases.test.ts`（9 项）：
- 两份 Fixture 都能被真实的 `releaseDTOSchema` 严格解析；正好覆盖两个真实 Demo，且它们都有公开项目页。
- 不夸大：来源为 fixture、无 `EXPERIMENT_VERIFIED`、无 `REPORTED` 指标。
- 服务端渲染每个预览页：带 Fixture 声明与 `NOT_FOUND` 说明、渲染全部区块与声明、链接到真实 Demo、不显示 `publishedAt`、不出现“发布于”。
- 含 `<script>`、`onerror`、图片和 `javascript:` 链接的 Markdown 不会进入输出。
- 项目页只有在存在 Fixture 时才显示预览按钮。

## 4. 接入真实公开投影

1. 把 `getShowcaseRelease(slug)` 改为调用公开读取（S-1），返回同一个 `ReleaseDTO`；组件不需要改。
2. 删除 `source: "fixture"` 分支对应的声明文案；保留 `noindex` 直到 UNLISTED 规则在服务端落实。
3. IMAGE 区块与文档改用资产分发（S-3）返回的地址。

## 5. Showcase 需要的接口（交 Codex 决定）

| # | 需求 | 原因 |
| --- | --- | --- |
| S-1 | 公开读取：按 slug（或 projectId）返回当前有效、未撤回 Release 的严格 `ReleaseDTO`；HTTP 路由、缓存与撤回后的失效方式 | `getPublicRegistryRelease` 目前恒为 `NOT_FOUND` |
| S-2 | 公开投影里的 `slug` 与 `category` | `releaseDTOSchema` 没有这两个字段，但 Explore 按 slug 路由、按类别筛选；否则前端需要另一次读取 |
| S-3 | 资产分发：IMAGE 区块、文档与证据资产的地址（绑定 Release，含 MIME、尺寸） | 依赖 B3-A 隔离与字节验证（PR #40）之后的分发闭环 |
| S-4 | 公开列表：只含 PUBLIC 的摘要列表（分页） | Explore 目录；UNLISTED 不得出现 |
| S-5 | 可运行能力的关联字段 | 0.5.0 的 `integration.mode` 只有 `SHOWCASE`，发布页无法从契约得知它对应哪个 Demo / 能力；现在用 Fixture 包装层的 `slug` 关联 |
| S-6 | Markdown 的服务端约定：允许的语法、`sourceAssetIds` 的用途 | 前端已按不可信内容受限渲染，但需要和服务端的净化策略一致 |

## 6. Research Lab：实施方案与接口需求（本次不开发）

**目标**：研究型项目的“可验证成果页”。每条研究声明都能追到证据，并能在实验室里复现，读者看到的是“声明 → 证据 → 复现”的链条，而不是只看结论。

**复用现有基础**：`researchClaims`（四级状态，`EXPERIMENT_VERIFIED` 已由 schema 强制要求证据资产）、BENCHMARKS 的 `REPORTED` 指标（`dataset`、`protocol`、`modelVersion`、`evidenceAssetId` 必填）、现有交互实验室（`volume-lab`、`sorting-lab`、神经网络 Worker 协议 `aig.worker/1`），以及本次的 `ReleaseShowcase` 区块渲染。

**分阶段**：

| 阶段 | 内容 | 前置条件 |
| --- | --- | --- |
| R0 | 声明账本 UI：按状态分组，声明 ↔ 指标 ↔ 证据的对应关系；证据先显示占位 | 无，可用 Fixture 完成（约 1 个前端 PR） |
| R1 | 证据查看：图片、Markdown、表格数据的只读查看器，显示摘要、扫描版本与数据等级 | L-1、L-2 |
| R2 | 复现运行：在浏览器 Worker 或服务端能力中按固定种子与协议复现，并与已报告指标比较 | L-3、L-4 |
| R3 | 第三方实验室：独立 origin 的 iframe 沙箱 | L-5 |

**接口需求**：

| # | 需求 | 说明 |
| --- | --- | --- |
| L-1 | 证据资产读取 | 只读、绑定 Release 的证据资产地址与元数据（`sourceDigest`、`deliveryDigest`、`scanRevision`、`dataClass`）；依赖 B3-A 后的分发 |
| L-2 | 数据类资产的 MIME 与大小上限 | 当前发布绑定只接受 `text/markdown` 与 PNG / JPEG / WebP；研究证据需要 CSV / JSON 等，并需决定大小上限与预览方式 |
| L-3 | 运行记录 | 创建绑定 `releaseId` + 能力 + 种子 + 协议的运行，返回状态与结果；保留期限与可见性规则 |
| L-4 | 复现判定 | 由谁计算“复现值与已报告值是否一致”（容差、单位、随机性）；结果是否回写到声明状态（建议只追加事实，不改原 Release） |
| L-5 | L1 沙箱 | 第三方实验室代码的独立 origin、消息协议版本与权限边界 |

**需要 Owner 决定**：Research Lab 是项目页的一个标签，还是独立的产品区域；复现运行的计算预算与配额；是否允许公开读者触发服务端复现。

## 7. 未验证与风险

- 按指示没有启动浏览器、没有截图。渲染只在 Node 中服务端渲染验证；真实布局、响应式断点、深色模式与动效未经可视检查。新页面复用项目页与开发者控制台已验收的组件和样式，结构上风险较低，但 Owner 首次查看时仍应看一眼桌面与手机宽度。
- `features/platform/demo-projects.ts` 仍把两个 Demo 的 1.0.0 标为 `IN_REVIEW`（历史遗留，Owner 决定）；预览页不引用它。

## 8. 改动范围与最终结果

新增：`features/showcase/**`、`app/explore/[slug]/release/page.tsx`、本文件。
修改：`features/platform/components/showcase.tsx`（可选的预览按钮）、`app/explore/[slug]/page.tsx`（传入预览地址）。
未触碰：`prisma/**`、`supabase/**`、`features/registry/**`、`lib/auth/**`、`middleware.ts`、`app/api/**`、`tests/**`、`vercel.json`、`.github/**`、主页、开发者控制台。

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint`（零警告） | 通过 |
| `pnpm test` | 165 文件 / 1142 项通过；134 项需隔离数据库的集成测试照旧跳过 |
| `pnpm build` | 通过；`/explore/[slug]/release` 只为两个 Demo 静态生成（●），其他 slug 404；预渲染 HTML 含 Fixture 标注、noindex、NOT_FOUND 说明与真实 Demo 链接；只有两个 Demo 的项目页含预览按钮 |
