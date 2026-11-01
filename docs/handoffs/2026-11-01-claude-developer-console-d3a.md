# 交接：P1-D3-A 开发者控制台 Registry 只读模式（Claude，2026-11-01）

> 分支 `claude/p1-d3a-readonly-console-20261101`，最初基于 PR #43 head `62f82d8`（P1-C1-A 内部只读 API）。#43 与 #45 合并后，已通过合并提交同步最新 `main`（见第 7 节）。未修改 Research Lab（#42）、Showcase、Landing、迁移、RLS、Auth、CI 工作流、生产配置或任何 Registry 服务端模块。

## 1. 交付内容

登录后的开发者控制台现在有两个明确分开的数据源：

| 模式 | 路由 | 数据 | 写入 |
| --- | --- | --- | --- |
| Mock 演示（原有） | `/developer`、`/developer/projects/[slug]`、`/developer/integrate`、`/developer/access`；公开版 `/platform/developer/*` | 浏览器内存中的类型化 Mock，刷新即重置 | 完整模拟，不保存 |
| Registry 只读（新增） | `/developer/registry`、`/developer/registry/projects/[projectId]` | 当前登录用户通过 P1-C1-A 内部 GET 接口读取的真实数据 | 全部不可用 |

- 两个模式是不同的路由和不同的 Provider：`app/developer/(mock)/layout.tsx` 挂 Mock 的 `ConsoleProvider`，`app/developer/registry/layout.tsx` 挂 `RegistryConsoleProvider`，父布局只做登录检查和 AppShell。Registry 路由下没有 Mock 状态，Mock 组件在 Registry 路由中无法渲染（缺少 Provider 会直接抛错），因此不存在“回退到 Mock”的路径。
- 登录版控制台顶栏新增「Mock 演示 / Registry 只读」切换；公开演示版不显示。两种模式的数据源徽标不同（「Mock 数据源 · 不保存」/「Registry 数据源 · 只读」），Registry 模式的身份固定为“当前登录账户”，没有身份切换和模拟环境。
- Mock 演示的交互、种子、引擎与测试保持不变。工作台说明中“Registry 还没有 HTTP 接口”一句改为“还没有写入接口（只读接口默认关闭）”，其余文案与结构未动。

### Registry 只读模式显示什么

| 屏幕 | 内容 | 读取 |
| --- | --- | --- |
| 项目与资格 | 自己的平台操作资格（动作、到期时间、剩余时间）；自己可访问的项目列表（slug、可见性、自己的角色），分页读取 | `/qualifications`、`/projects` |
| 项目 | 项目与本项目内有效资格（资格 ∩ 角色）；草稿头（状态、revision、ETag、服务端内容哈希）与 DraftDTO 摘要；当前草稿的审核；不可变版本；发布头、发布历史、发布申请；写入命令不可用清单；每个 GET 的读取记录 | 8 个项目级 GET |

## 2. 契约使用

- 只调用 P1-C1-A 文档列出的 GET 路径；`Authorization: Bearer <access token>`，`credentials: "omit"`（不发送 Cookie）、`cache: "no-store"`、`redirect: "error"`。查询参数只有 `limit`（1–50）和 UUID `after`；ID 在发送前校验为 UUID，格式不对的请求不发送。
- Access Token 每次请求时从现有 Supabase 浏览器会话（`getSession()`）读取，只存在于该次请求的局部变量里；不写入 localStorage/sessionStorage、日志、URL、状态快照、结果或错误。错误对象只有 `{code, status, retryAt?}`。
- 响应用共享的严格 schema 校验：Review、项目、资格、Release 与分页 schema 直接来自 `features/registry/read-contracts.ts` / `query-contracts.ts`。Draft 与 Version 的 schema 所在的 `contracts.ts` 依赖 Node 的 JCS 哈希，不能进入浏览器，因此在 `features/developer-console/registry/contract.ts` 中做了结构镜像（不含哈希与去重校验）；`contract.test.ts` 逐层比较镜像与服务端 schema 的字段、严格性、可选性、枚举与字面量，任何漂移即失败。未知字段、`replayed` 不为 false、ETag 格式或响应头与正文不一致、状态码与错误码不匹配、属于其他项目或对象的响应，一律记为 `CONTRACT_MISMATCH`，不渲染。
- 内容哈希只用服务端返回值；真实模式不导入 `content-hash.ts`，浏览器不计算哈希（`isolation.test.ts` 检查依赖图）。审核与当前草稿的绑定按服务端哈希和 revision 比较；草稿头与 DraftDTO 是两次独立读取，ID、revision、ETag、哈希任一不一致时提示“两次读取之间草稿已变化”。
- ETag：只有草稿头、DraftDTO、审核详情与发布头携带 ETag，界面显示并在刷新后标注“自上次读取后已变化”。不发送 `If-Match`、`If-None-Match` 或 `Idempotency-Key`；项目与列表响应不当作 CAS 标签。
- 分页：列表按服务端 UUID 顺序分页，显示时按明确的时间字段排序（版本按封存时间、发布按发布时间、申请按到期时间、审核按 revision、项目按 slug），并注明“排序只覆盖已读取的部分”。刷新从第一页重新开始；“读取下一页”使用排他游标并去重。
- 资格：READ_DRAFT 与 READ_RELEASE 各自决定各自的区块；缺少其中一个只影响对应区块。资格与“资格 ∩ 角色”只描述读取时刻的身份与角色门，界面明确写出“不代表某个具体命令可以执行”。
- 发布申请的 `state`（待批准 / 已批准 / 已执行）与 `expired`、`stale` 分开显示；`requestedByViewer`、`approvedByViewer`、`submittedByViewer` 显示为“由你申请 / 由你批准 / 由你提交”，没有任何对方身份。

### 错误处理

| 结果 | 处理 |
| --- | --- |
| 401 AUTH_REQUIRED，或本地没有会话 | 所有区块清空并显示“登录会话已失效 / 没有可用的登录会话”，提供“重新登录”（`/login?next=` 回到当前页） |
| 403 DISABLED | 所有区块清空，显示“Registry 只读接口未开启”是服务端真实状态；只提供单独的「打开 Mock 演示」链接，不替换数据 |
| 403 FORBIDDEN | 只清空该区块，说明缺少的是 READ_DRAFT 还是 READ_RELEASE |
| 404 NOT_FOUND | 清空该区块；整个项目不可见时只显示一次“不存在，或你不是有效成员” |
| 409 DRAFT_UNINITIALIZED | 作为草稿状态显示，不是错误 |
| 409 CONFLICT、503、网络错误、契约不符 | 保留上一次成功读取的数据并标注读取时间 |
| 429 RATE_LIMITED | 按 `Retry-After`（缺省 60 秒）暂停所有请求，期间不发送、刷新按钮停用并显示恢复时间 |
| 422 INVALID_INPUT | 区分“未发送”（本地拒绝）与服务端拒绝 |

每次加载项目约 8 个 GET（草稿与审核在草稿头之后读取）；30 秒内回到同一页面复用已有结果，不自动轮询，避免消耗每分钟 60 次的读取额度。

### 写入

`createRegistryReadAdapter()` 与 `ConsoleAdapter` 共享 `execute` / `replay` 签名，只为明确拒绝：两者都以 `RegistryWritesUnavailableError`（`code: "READ_ONLY"`）拒绝，不读取 Token、不发请求、不调用 Mock 引擎。客户端模块只会产生 GET。项目页列出 12 个会改变状态的命令（含 B3-A 资产命令），每个都标“不可执行”，只对照显示读取时是否有资格。页面上唯一的按钮是“重新读取”和分页按钮。

## 3. 改动范围

新增：
- `features/developer-console/registry/{contract,client,store,adapter,view}.ts` 与对应测试（`contract`、`client`、`store`、`view`、`http-compat`、`isolation`）。
- `features/developer-console/components/{registry-provider,registry-header,registry-kit,registry-workbench,registry-project,console-mode-switch}.tsx`、`registry-render.test.ts`。
- `app/developer/(mock)/layout.tsx`、`app/developer/registry/{layout,page}.tsx`、`app/developer/registry/projects/[projectId]/page.tsx`。
- `tests/fixtures/registry-console-read.ts`、`tests/integration/developer-console-registry.integration.test.ts`。

修改：`app/developer/layout.tsx`（移出 Mock Provider）；`app/developer/{page,access,integrate,projects}` 移入 `(mock)` 路由组（URL 不变，内容不变）；`console-header.tsx`（可选的模式切换）；`workbench.tsx`（一句说明）。

未触碰：`features/registry/**`、`app/api/**`、`prisma/**`、`supabase/**`、`lib/auth/**`、`middleware.ts`、`.github/**`、`vercel.json`、Mock 引擎与种子、Research Lab、Showcase、Landing。没有新增或开启任何开关；三个读取开关仍默认关闭，真实模式在开关关闭时显示 DISABLED。

## 4. 验证

本地（Windows，Node 22.23.1，pnpm 11.7.0，候选提交见 PR）：

| 检查 | 结果 |
| --- | --- |
| 控制台单元测试 | 10 个文件 / 154 项通过（新增 6 个 Registry 文件 + 1 个渲染文件） |
| 全量单元测试 `pnpm test` | 175 个文件 / 1305 项通过；13 个需要真实数据库的集成文件（175 项）在无数据库环境下按设计跳过，另行运行 |
| 真实数据库验收（任务专用一次性 Supabase `aig-platform-p1-final-d3a-20261101`，仅 127.0.0.1:60721/60722，经仓库 `disposable-supabase.mjs bind` 绑定回环） | 新增 5 项与 P1-C1-A 现有 13 项单独运行：18/18 通过；完整集成运行器 `pnpm test:integration`：13 个套件 / 175 项全部通过，严格校验器确认无跳过、无 TODO |
| 回收 | `supabase stop --no-backup` 后，本项目的容器、卷、网络均为 0，端口 60720–60722 已关闭；其他任务的既有容器未触碰 |
| `pnpm typecheck` / `pnpm lint`（零警告） | 通过 |
| `pnpm build`（Node 22） | 通过；`/developer/registry` 与 `/developer/registry/projects/[projectId]` 为动态路由，公开演示页仍为静态 |
| 客户端包检查 | `.next/static` 中没有 `registry_private`、`internal_operators`、`PrismaClient`、`SUPABASE_SERVICE_ROLE_KEY`、`hashSnapshot`、`node:crypto` |

Node 24 兼容性与远端浏览器矩阵只在 CI 中运行，结果见 PR。

真实数据库验收覆盖：控制台读取全部区块并取得服务端哈希与 ETag；提交人、申请人、批准人的相对布尔值；READ_DRAFT 与 READ_RELEASE 双向独立；有资格的非成员看不到任何项目数据；登出后与 HTTP 开关关闭后清空全部数据；项目列表排他游标分页；写入拒绝不发请求、不改变数据库。

单元测试覆盖：请求头与 Cookie/缓存/重定向设置；Token 不进入结果、错误、URL 或存储；所有错误码与状态码映射；未知字段、错误的 ETag、跨项目/跨对象响应；429 暂停与恢复；分页参数边界与游标；独立资格；撤销后清空与临时故障保留；ETag 变化；未初始化草稿；过期响应丢弃；按时间而非 UUID 排序；镜像 schema 与服务端 schema 的结构一致；Mock 与 Registry 的依赖隔离；全部写入命令拒绝；各状态的服务端渲染（无写入控件、文本转义、无 Mock 数据）。

## 5. 未验证与风险

- **没有本地浏览器验证。** 按 `AGENTS.md`，未启动浏览器、未截图、未运行 E2E。新页面的布局、响应式、深色模式、键盘与读屏只做了代码层面的处理（沿用现有控制台组件与语义结构），视觉验收需要 Owner 另行授权。现有 E2E 不访问 `/developer/registry`；远端 CI 的浏览器矩阵照常运行。
- 真实模式在浏览器中运行的完整链路（Supabase 浏览器会话 → `getSession()` → 同源 fetch → 路由）没有在真实浏览器中执行过；集成测试在进程内调用同一个路由处理函数，验证了处理函数、真实 Auth 与数据库，但不包括 Next 路由层与浏览器自动附加的 `Sec-Fetch-Site` 头。
- 浏览器端的 Draft/Version 镜像 schema 只校验结构与格式，不重算哈希、不检查去重；完整校验由服务端完成。建议 Registry 以后导出一个不依赖 Node 的 payload schema，届时删除镜像。
- 读取限流仍是 P1-C1-A 的单进程限流；控制台遵守 429 与 `Retry-After`，但这不是分布式配额。多实例启用前仍需共享入口限流（见 C1-A 文档）。
- 刷新时 8 个读取互相独立，不是同一快照；界面按区块显示各自的读取时间，并对草稿头与 DraftDTO 的不一致给出提示。

## 6. 需要 Owner 决定

1. ~~#43 合并后同步 main 并重跑完整 CI~~：已完成，见第 7 节；CI 结果见 PR。
2. 是否、何时在某个隔离环境开启三个读取开关，并为测试账户授予 READ_DRAFT / READ_RELEASE，以便在真实浏览器中验收（需要单独授权浏览器自动化）。
3. 后续写入：C-5（开始下一版草稿）、内部 HTTP 写接口（If-Match / Idempotency-Key 映射、正文大小、限流与 CSRF/Origin 验收）都尚未实现；本 PR 不包含任何写入准备之外的改动。

## 7. 与 main 同步（2026-11-01）

- 方式：在本分支上 `git merge --no-ff origin/main`（`ba0692f`，含 #43、#45、#42），生成合并提交 `a3a8bec`。没有 rebase、没有改写历史、没有 force-push；原提交 `62f82d8`、`b3acf9a` 保留。
- 冲突：无。本分支与 `62f82d8..main` 之间没有共同修改的文件。
- 兼容性：#43 在 `62f82d8` 之后只合并了 main，`features/registry/**`、`app/api/**`、`lib/auth/**`、`prisma/**`、`supabase/**` 与 `62f82d8` 完全一致，因此控制台使用的 DTO、错误码、ETag 规则、读取资格与三个默认关闭的开关（`REGISTRY_INTERNAL_ACCESS_ENABLED`、`REGISTRY_INTERNAL_READ_ENABLED`、`REGISTRY_INTERNAL_READ_HTTP_ENABLED`）都没有变化，无需调整控制台代码。同步后本分支相对 `main` 的差异仍只有第 3 节列出的 32 个文件。
- CI 拓扑（#45）：新增的真实数据库套件 `tests/integration/developer-console-registry.integration.test.ts` 由 `pnpm test:integration` 自动发现，在 Security Acceptance 的 clean install and integration 作业中运行；运行器对任何跳过都判失败。无需修改工作流。

同步后本地复验（Windows，Node 22.23.1，pnpm 11.7.0）：

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` / `pnpm lint`（零警告） | 通过 |
| `pnpm test` | 178 个文件 / 1358 项通过；13 个真实数据库文件（175 项）在无数据库环境下按设计跳过，由 CI 运行 |
| Registry 契约与兼容性（控制台 7 个文件 + `features/registry` 6 个文件 + `scripts/ci-topology.test.ts`） | 14 个文件 / 237 项通过，包括镜像 schema 对齐、客户端对真实 `createRegistryReadHandler` 的兼容、Mock 隔离 |
| `pnpm build` | 通过；两个 Registry 路由为动态路由，Research Lab 路由正常生成 |
| 客户端包检查 | 同第 4 节的 6 个标识均为 0 |

本次同步未在本地重新运行一次性 Supabase 集成验收；真实数据库、迁移与三端浏览器验收以该提交的远端 CI 为准。
