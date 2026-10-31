# 交接：P1-D 开发者控制台前端（Claude，2026-10-31）

> 分支 `claude/p1-d-developer-console-20261031`，最初基于 `origin/main` `aef7316`（含 PR #37 / P1-B2-A），之后合并了 `origin/main` `64a5718`（含 PR #38 / P1-B2-B），并按已合并的 Release 契约对齐了 Mock。独立 worktree，未使用 Codex 未合并分支作为基础。
> 未合并 main，未部署，未改数据库、migration、RLS、Auth、Registry、安全验收或任何后端接口。

## 1. 交付内容

一个可以实际操作的开发者控制台，公开演示版与登录版共用同一套组件：

| 页面 | 演示（公开、静态） | 登录后 | 内容 |
| --- | --- | --- | --- |
| 工作台 | `/platform/developer` | `/developer` | 我的项目及其流程位置、发布流程五步与契约状态、接口就绪度、两个真实 Demo 入口、上手四步 |
| 发布台 | `/platform/developer/projects/[slug]` | `/developer/projects/[slug]` | Project → Draft → Review → Version → Release 的完整交互流程，身份切换、模拟环境、协议日志 |
| 接入 | `/platform/developer/integrate` | `/developer/integrate` | 四步接入（真实 curl）、Manifest 校验器（`#manifest`）、Demo API 操作表、Registry 内部函数表、平台 API 草案、接入等级、运行状态机、契约文件 |
| 权限与隐私 | `/platform/developer/access` | `/developer/access` | 三道门、操作 × 角色矩阵（可按角色筛选）、DTO 字段白名单、可见性投影规则、BYOK 状态、数据去向 |

原 `features/platform/components/developer-console.tsx` 已删除，其中的 Manifest 校验、接入等级、状态机、接口草案与契约文件移入「接入」页并更新为当前事实（例如契约文件不再写“尚未合并到 main”）。命令面板与项目页的「校验 Manifest」链接改指 `…/integrate#manifest`。

### 发布台能做什么

四个示例项目各自处在流程的不同位置（与 `features/platform/fixtures.ts` 的名称、版本、发布历史一致）：

| 项目 | 初始状态 | 适合演示 |
| --- | --- | --- |
| 排序算法对照实验 | 1.0.0 已发布、0.9.0 已撤回、1.1.0 草稿编辑中 | 编辑 → 提交 → 审核 → 封存 → 申请发布 → 批准 → 发布；并发编辑导致 412 |
| 城市空气质量摘要 | 0.1.0 已发布（不公开列出）、0.2.0 已提交、待审核 | 独立审核（自审被拒）、15 分钟期限、撤回审核 |
| 体数据三维重建 | 0.3.0 当前、0.2.0 已被替换、0.1.0 已撤回、草稿已冻结 | 回滚（用旧版本创建新 Release）、撤回当前发布 → 私有、开始下一版草稿 |
| 研究笔记工作区 | 私有、B1 空草稿、只有一名成员 | `DRAFT_UNINITIALIZED`、首次编辑、没有第二人就无法独立审核；私有版本可以发布，但不产生公开投影 |

- **模拟身份**：你 / 示例协作者 / 示例审核人 / 示例访客成员。按钮在缺少角色或违反独立性时说明原因，提供“一键切换为能做这件事的人”，以及“仍然发送，查看拒绝响应”。
- **模拟环境**：协作者并发保存（你手里的 ETag 过期）、时钟快进 16 分钟（审核/发布申请过期）、撤销或恢复当前身份的平台操作资格（epoch 推进，旧审核不复活）、重置示例数据。
- **协议日志**：每个请求对应的库函数名、If-Match、Idempotency-Key、input、响应或稳定错误码；可用同一个幂等键重放（`replayed: true` 或 `REPLAY_STALE` / `IDEMPOTENCY_CONFLICT`）。

## 2. Mock 边界

所有 Registry 数据来自 `features/developer-console/mock/`，**只在浏览器标签页内存中，刷新即重置，不调用任何服务、不写任何存储**。每个控制台页面顶部固定显示「Mock 数据源 · 不保存」，项目标注「示例项目 · Mock」。

| 部分 | 依据 | 标注 |
| --- | --- | --- |
| 草稿、审核、版本（编辑/提交/撤审/决定/封存） | 已合并的 `features/registry/protocol.ts`：检查顺序、强 ETag、CAS、幂等回执、独立审核、15 分钟期限、epoch/资格新鲜性、错误码与状态码、B1 trigger 的 revision 递增 | 已合并契约 |
| 发布（申请/批准/发布/撤回/回滚） | 已合并的 `features/registry/release.ts`、`release-context.ts` 与 release migration 中的 `guard_project`：检查顺序、发布头强 ETag、CAS、幂等回执与重放新鲜性、独立批准、原申请人执行、15 分钟期限、revision/epoch 推进、错误码与状态码 | 已合并契约 |
| 开始下一版草稿 | 没有任何契约 | 契约缺口 |
| Demo API、OpenAPI、Manifest 校验、两个 Demo | 真实实现 | 已上线 |
| BYOK / Grant | 未实现；页面上没有任何密钥输入框 | 规划中 |

真实性约束：

- 种子 payload 与封存版本在单测中逐个通过真实的 `draftPayloadSchema` / `validateDraftPayload` / `draftDTOSchema` / `versionDTOSchema`（后者会重算 JCS 哈希）。
- 浏览器端内容哈希 `content-hash.ts` 是为 Mock 写的最小 RFC 8785 + SHA-256；单测要求它对全部种子 payload 与 `tests/fixtures/registry-jcs-vectors.json` 的 5 个固定向量与 `hashSnapshot()` 逐字节一致。它不是安全边界，真实 Adapter 不应在浏览器计算哈希（见 C-1）。
- `permissions.ts` 的 `DRAFT_ROLES` 与 `RELEASE_ROLES` 各有单测，分别直接解析 `protocol.ts` 与 `release-context.ts` 源码中的私有 `roles` 映射，不一致即失败。`model.ts` 的 `ReleaseAction` 直接取自 `release-context.ts` 的 `Action` 类型（仅类型导入），动作改名会让类型检查失败。
- 「权限与隐私」页的 DTO 字段由服务端组件直接读取 `contracts.ts` 的 zod schema 生成。
- 「接入」页的 Demo API 操作由 `buildOpenApiDocument()` 生成。

Mock 与真实协议的已知差异：身份可切换（真实环境中就是登录账户）；平台操作资格在 Mock 里是每个身份一个开关（真实环境按动作单独授予，Mock 只模拟“全部有效”或“全部撤销”）；不检查资产引用与资产摘要绑定（种子 payload 不引用资产，因此不会出现 `ASSET_INVALID`）；不模拟 `DISABLED` 开关与原审核的显式失效；不检查请求体字节大小与 Unicode 细节；HTTP 成功状态码未定义，日志里只写“成功”。

### 与已合并 P1-B2-B 的对齐（合并 PR #38 之后）

逐条对照 `release.ts`、`release-context.ts`、release migration 和 `registry-release.integration.test.ts`，修正了 Mock 中按草案做出的假设。只改了 Mock 引擎、种子、契约标注和对应测试，没有改界面结构：

| 项 | 之前（草案假设） | 现在（与合并实现一致） |
| --- | --- | --- |
| 私有版本 | 申请发布返回 `APPROVAL_INVALID` | 允许申请与发布；项目得到当前 Release 但保持私有，不产生公开投影（集成测试默认就用 PRIVATE 夹具） |
| 撤回历史 Release | 只推进 revision | revision 与授权 epoch 都推进（`authzEpoch: { increment: 1 }`），旧批准随之失效 |
| 重复批准 / 已消费的批准 | 一律 `CONFLICT` | 先做新鲜性检查：已消费的批准因发布头变化返回 `APPROVAL_INVALID`；仍新鲜的请求再次批准返回 `CONFLICT`（`request_id` 唯一） |
| 发布 / 回滚的重放 | 只看当前指针 | 还要求原请求未过期、申请人和批准人仍有资格（consumed freshness），否则 `REPLAY_STALE` |
| 请求绑定 | 只绑 revision | 同时绑定 revision、授权 epoch 与当前指针，并在批准和发布时复核版本哈希、可见性与回滚目标 |
| 资格变化 | 只推进 epoch | 同时推进项目 revision（B1 `guard_operator` 更新 projects 行 → `guard_project`），发布头 ETag 随之过期 |
| 输入校验顺序 | 三道门之后 | 与 `parse(inputSchema)` 一致，在认证之前；`intent` 与 `targetReleaseId` 必须成对（ROLLBACK 必带，PUBLISH 不带） |
| 命令响应 | 控制台自定义的申请 / 发布对象 | 与 `release.ts` 的 `Response.result` 一致：`{ id, projectId, versionId, state }`，批准返回批准 ID |
| 种子历史 | 授权 epoch 只按当前可见性推算 | 按时间重放发布与撤回事件；例如排序实验现为 rev 4 · epoch 4 |
| 标注 | 发布相关显示「暂定契约」 | 显示「已合并契约」；`getRegistryReleaseHead` 加入函数表 |

新增或改写的测试：申请/批准/发布的响应形状；撤回历史 Release；重复批准与已消费批准；重放期限；资格变化使发布头过期；输入先于访问检查；种子 epoch；私有版本发布；`RELEASE_ROLES` 与 `release-context.ts` 一致。

## 3. 接口依赖与契约需求（交 Codex 决定）

前端没有修改任何 API / DTO / 数据库。

**后端已具备（main `64a5718`）**：全部是 `server-only` 库函数，没有 HTTP 路由，默认关闭。
- B1 `createInternalRegistryProject`，开关 `REGISTRY_INTERNAL_ACCESS_ENABLED`。
- B2-A 草稿 / 审核 / 版本，额外需要 `REGISTRY_DRAFT_REVIEW_ENABLED`：
  - 读取：`getRegistryDraftHead`、`getRegistryDraft`、`getRegistryReview(id)`；
  - 命令：`edit`、`submit`、`withdraw`、`decide`、`seal`。
- B2-B 发布，额外需要 `REGISTRY_RELEASE_COMMANDS_ENABLED`：
  - 读取：`getRegistryReleaseHead`（项目 ID、当前 Release、可见性与发布 ETag）；
  - 命令：`request`、`approve`、`publish`、`withdraw`、`rollback`。
- `getPublicRegistryRelease` 对所有输入返回 `NOT_FOUND`，公开投影尚未开放。
- 三道门、强 ETag、幂等回执、新鲜性与错误码都已实现，并有隔离数据库的安全验收。

**仍需 Codex 决定或实现**，按优先级：

| # | 需求 | 现状（main `64a5718`） | 仍需 |
| --- | --- | --- | --- |
| C-1 | Draft 读取返回服务端计算的 `contentHash` | 未提供。`contentHash` 只出现在 Review 与 Version 上 | `getRegistryDraftHead` / `getRegistryDraft` 返回当前内容的 JCS 哈希；`submit` 需要 `expectedContentHash`，否则前端必须自己实现 JCS |
| C-2 | 可共享的响应类型与 schema | 未提供。`reviewDTO()` 没有导出类型；`release.ts` 的命令响应类型 `Response` 是模块私有的 | 从非 server-only 模块导出 Review DTO 与 Release 命令结果（`{ id, projectId, versionId, state }`）的类型或 zod schema；控制台目前在 `model.ts` 手写镜像，并用测试对齐 |
| C-3 | 相对调用者的布尔字段：`submittedByViewer`、`requestedByViewer` | 未提供。自审与非申请人执行只能在发送后得到 `FORBIDDEN` / `APPROVAL_INVALID` | 在 Review 与发布申请的读取中返回这两个布尔值，不暴露对方身份 |
| C-4 | 动作 → 角色映射可共享 | 未提供。`protocol.ts` 与 `release-context.ts` 各有一份私有 `roles` | 导出到可共享模块；在此之前，两份映射都靠源码解析单测防漂移 |
| C-5 | 从某个 Version 开始下一版草稿的命令 | 未提供。B2-A 封存后草稿冻结；B2-B 没有涉及 | 新命令（角色、输入、ETag 语义由 Codex 定义）；控制台中这一步标为「契约缺口」，只在 Mock 中可用 |
| C-6 | 列表与详情读取 | 部分提供。B2-B 新增了发布头读取 | 仍缺：当前用户可见的项目列表、版本列表、按草稿列出的审核、发布历史（含撤回事实）、发布申请与批准（含 `state`、`expiresAt`、`approvalId`）、当前用户在项目中的角色。控制台的 `ConsoleProjectView` 需要这些字段 |
| C-7 | 当前用户自己的平台操作资格 | 未提供。B2-A / B2-B 都按动作单独授予（`operator_actions`） | 只读接口：动作 + 到期时间，只返回调用者自己的资格；用来解释第二道门 |
| C-8 | 内部 HTTP 映射 | 未提供。两份契约都写明当前没有 Registry HTTP API | 路由、成功状态码、响应信封 `{ result, etag, replayed }`、`If-Match` / `Idempotency-Key` / `ETag` 头、错误体 `{ code }`。B2-B 契约还要求 UTF-8 字节解码、正文大小、限流、CSRF / origin 与错误映射单独验收 |
| C-9 | 与 B2-B 对齐 | **已完成**（见第 2 节“与已合并 P1-B2-B 的对齐”） | 无。若 Release 命令结果或错误码再变，需要同步 `mock/engine.ts` 与测试；`RELEASE_ROLES` 和 `ReleaseAction` 已有自动检查 |

## 4. 后续集成方法

1. 实现 `createRegistryConsoleAdapter()`，满足 `features/developer-console/adapter.ts` 的 `ConsoleAdapter`：`source: "registry"`、`tools: null`；`getSnapshot()` 由 C-6 的读取组装 `ConsoleProjectView`（类型在 `model.ts`）；`execute()` 把 `ConsoleCommand` 映射为 HTTP 请求并把错误映射为 `{ code, status }`。
2. 在 `components/console-provider.tsx` 里按开关选择 Adapter（默认保持 Mock）。`tools: null` 时，身份切换与模拟环境自动隐藏，按钮按登录用户的角色启用。
3. 去掉对 `content-hash.ts` 的依赖，改用 C-1 返回的哈希。
4. `mock/engine.test.ts` 描述了期望的协议行为，可改写为对真实 Adapter 的契约测试。
5. 页面与组件不需要改动；`/developer/*` 已在登录保护下。

## 5. 验证（2026-10-31，Node 22 / pnpm 11.7.0，Windows）

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint`（零警告） | 通过 |
| `pnpm test` | 合并 main 并对齐 B2-B 后：164 文件 / 1133 项通过；134 项需隔离数据库的集成测试照旧跳过（含 PR #38 新增的 Release 集成测试）。控制台 3 个文件 / 60 项 |
| `pnpm build` | 通过；`/platform/developer`、`/integrate`、`/access` 静态预渲染，四个发布台 SSG；`/developer/*` 为动态 |
| 预渲染 HTML 静态检查 | 7 个演示页面标题正确、均含「Mock 数据源」、无 `undefined` / `NaN` |
| 客户端包检查 | `.next/static` 中没有 `registry_private`、`internal_operators`、`PrismaClient` 或服务端密钥名；Registry 模块只以 `import type` 进入客户端代码 |

新增测试：

- `content-hash.test.ts`：SHA-256 对比 node:crypto；canonical JSON 对比 5 个 JCS 固定向量；全部种子 payload 与 `hashSnapshot()` 一致。
- `mock/engine.test.ts`：种子满足合并契约；完整流程与 revision 递增；428/422/412；失败回滚；幂等重放与键冲突、键按 actor 隔离；并发编辑；角色缺失返回 NOT_FOUND；自审 FORBIDDEN；审核过期；资格撤销与恢复；撤审；未初始化草稿；跨项目 payload；撤回当前发布 → 私有；回滚创建新 Release、PUBLISH 不能消费 ROLLBACK 批准；发布头变化使批准失效；私有版本不能发布；开始下一版草稿；角色映射与 `protocol.ts` 一致。
- `components/render.test.ts`：在 Node 中服务端渲染全部四个页面与四个项目的发布台，检查不抛错、不输出 `undefined`/`NaN`、带 Mock 标识、两次渲染完全一致（避免水合不一致）、倒计时与权限提示存在、DTO 字段来自合并契约。

为让组件测试能导入 `.tsx`，`vitest.config.ts` 增加了一行 `oxc.jsx.runtime = "automatic"`（tsconfig 为 Next 保留 `jsx: "preserve"`）。不影响现有测试。

### 截图通道（Owner 授权的一次、单 Edge 实例）

Owner 在 2026-10-31 明确授权“一次单 Edge 实例的控制台截图”。执行与回收：

- 范围：只访问本地 `next start`（commit `b0dd6b8` 的生产构建，`127.0.0.1:3519`）上的 `/platform/developer/*`；不访问参考站、Preview 或生产。
- 实例：Playwright 1.61 `launchServer({ channel: "msedge", headless: true })`，全程 1 个 Edge 主进程（PID 39976，专用临时资料目录），所有尺寸、深浅色和交互复用同一页面；启动失败即停、不重试、不下载浏览器。
- 资源：Edge 进程树稳定在 9 个进程、工作集 640–670 MB，无增长趋势。
- 回收：脚本在成功、异常、超时和 SIGINT/SIGTERM/SIGHUP/SIGBREAK 下走同一清理路径；按记录的 PID + 创建时间 + 资料目录核对。独立复核结果：Edge 根进程与全部子进程已退出、临时资料目录已删除、Next 服务进程树已退出、3519 端口关闭；运行前已存在的 7 个用户 Edge 进程全部保留。没有按进程名结束任何进程。
- 页内检查（同一次访问中读取 DOM）：17 张截图全部 200；无控制台错误或页面异常；桌面 1440、平板 768、手机 390 宽度均无横向溢出；无无名按钮/链接、无未关联 label 的表单控件、无重复 id、无缺 alt 的图片；每页 1 个 `h1`、标题层级无跳级；所有页面显示「Mock 数据源」，无 `undefined`/`NaN`。

截图在 `docs/handoffs/assets/2026-10-31-developer-console/`（JPEG，整页）：

| 文件 | 内容 |
| --- | --- |
| `desktop-workbench.jpg` / `mobile-workbench.jpg` | 工作台 |
| `desktop-desk-sorting-lab.jpg` · `-air-quality` · `-volume-reconstruction` · `-research-notes` | 四个项目各处一个阶段的发布台 |
| `desktop-dark-desk-sorting-lab.jpg` / `tablet-desk-sorting-lab.jpg` / `mobile-desk-air-quality.jpg` | 深色、平板、手机 |
| `desktop-integrate.jpg` / `mobile-integrate.jpg` | 接入 |
| `desktop-access.jpg` / `mobile-access.jpg` | 权限与隐私 |
| `desktop-flow-1-stale-edit.jpg` → `desktop-flow-2-save-412.jpg` | 本地修改 → 协作者并发保存 → 用过期 ETag 保存得到 412 |
| `desktop-flow-3-reviewer-approves.jpg` | 切换为示例审核人并批准 |
| `desktop-focus-ring.jpg` | 键盘 Tab 焦点环 |

整页截图里中段出现的站点顶栏与底部浮动导航是固定定位元素在整页拼接时的位置，不是布局问题。

截图审阅后修复了 6 处问题（`987d558`）：

1. 手机宽度下「操作与角色」的角色筛选按钮逐字换行 → 标签不换行，窄屏横向滚动。
2. 接入页 `curl` 长行被代码块裁切 → 代码块按字符折行，复制内容不变。
3. 已封存草稿仍提示“这个版本号已被封存过” → 只在可编辑时提示。
4. 批准/拒绝按钮被说明文字撑宽、同一说明重复两次 → 两个按钮共用一条说明，按钮恢复自然宽度。
5. 操作结果只显示在页面上方，点击底部按钮后看不到 → 结果同时以一行文字显示在发出请求的按钮下方（上方横幅保留并继续 `aria-live`）。
6. 倒计时的“剩”和概览 Markdown 输入框用等宽字体，等宽字体栈没有中文字形 → 中文改用无衬线字体栈。

### 复查通道（Owner 第二次授权的一次、单 Edge 实例）

Owner 随后授权“再一次单 Edge 实例截图，复查这 6 处修复”。同一脚本与清理机制，只访问展示修复的页面：

- 构建：修复后的生产构建（17:48）。Edge PID 44788，9 个进程、工作集 640–680 MB。
- 回收：独立复核结果干净，Edge 与 Next 进程树均已退出、端口关闭、临时资料目录已删除。运行前已有的 14 个用户 Edge 进程中，有 1 个（PID 46720，在本次运行前 1 分钟由用户的 Edge 自行创建）在运行期间退出。本次清理只调用了本实例的 `BrowserServer.close()` 和按 PID 结束服务进程树（树中只有服务进程本身），没有对任何 Edge 进程执行结束命令；该进程属于用户 Edge 正常的进程回收。
- 页内复核（DOM 读数）：
  - 角色筛选 6 个按钮高度均为 36px、单行，筛选行可横向滚动，页面无横向溢出；
  - 桌面与手机接入页的代码块均无裁切（`pre-wrap`）；
  - 已封存草稿不再出现该警告；
  - 审核面板“仍然发送”只出现 1 次，批准/拒绝按钮宽 80px；
  - 倒计时“剩”与 Markdown 输入框为 figtree / Noto Sans SC 字体栈，数字保持等宽；
  - 用过期 ETag 保存后，保存按钮下方显示 `412 PRECONDITION_FAILED · ETag 已过期`；
  - 无控制台错误，无横向溢出。
- 受影响页面的整页截图已替换为修复后的版本（13 张）。未受影响的 `desktop-workbench`、`mobile-workbench`、`desktop-desk-research-notes`、`desktop-focus-ring` 保留第一次的截图。另有 8 张 `fix-*.jpg` 近景：

| 文件 | 修复 |
| --- | --- |
| `fix-1-mobile-role-filter.jpg` | 1 · 手机角色筛选单行 |
| `fix-2-mobile-curl.jpg` | 2 · 手机 `curl` 折行（顶部浮动导航是固定定位元素） |
| `fix-3-sealed-draft.jpg` | 3 · 已封存草稿无误报；概览框为无衬线字体 |
| `fix-4-review-actions.jpg` / `fix-4-mobile-review-actions.jpg` | 4 · 一条说明、按钮自然宽度 |
| `fix-5-inline-412.jpg` | 5 · 412 结果显示在保存按钮下方 |
| `fix-5-after-approve.jpg` | 批准后的审核面板（见下） |
| `fix-6-countdown.jpg` | 6 · “剩”为无衬线字体 |

复查中发现同类残留：审核被批准后，没有所有者/编辑角色的身份会看到「封存为 v0.2.0」与「撤回审核」各带一条相同的说明（`fix-5-after-approve.jpg`，修复前状态）。已用相同的共用说明方式修复（两个操作因同一原因被拒时合并说明），并新增服务端渲染测试；这一处**没有再次截图**。

## 6. 未验证与风险

- 截图通道只覆盖公开的 `/platform/developer/*` 和一个 Edge 引擎；登录后的 `/developer/*`（同一组件，外层为 AppShell）、WebKit/Safari、真实触屏、读屏软件朗读未验证。批准后封存/撤回共用说明的修复没有截图验证。可访问性另有代码层面的处理：语义标题与 landmark、表格 `scope`、`aria-current="step"`/`"page"`、`aria-live` 结果区、原生表单控件与 label、状态同时用文字表达、沿用全局 `prefers-reduced-motion`。
- 没有运行 E2E。现有 E2E 不访问开发者控制台页面，CI 中不会因本 PR 新增浏览器用例；也没有为控制台新增 E2E。
- 发布部分已按合并后的 P1-B2-B 对齐（C-9 已完成），但 Mock 仍不模拟资产绑定、按动作的资格和原审核显式失效（见第 2 节已知差异）。
- 截图早于 B2-B 对齐。对齐后界面结构不变，可见变化只有文字与数字：发布相关徽标由「暂定契约」变为「已合并契约」，种子项目的 epoch 数字变化，私有版本不再显示“不能发布”。按 Owner 指示没有为此重新截图。
- `features/platform/demo-projects.ts` 仍把两个 Demo 的 1.0.0 标为 IN_REVIEW（PR #36 已合并）。工作台只展示 Demo 的运行状态，没有引用这个字段；是否改为 PUBLISHED 由 Owner 决定（上一份交接第 8.5 项）。

## 7. 改动范围

新增：`features/developer-console/**`、`app/platform/developer/{layout,integrate,access,projects/[slug]}`、`app/developer/{layout,integrate,access,projects/[slug]}`、本文件、`docs/handoffs/assets/2026-10-31-developer-console/`（17 张整页截图与 8 张修复近景，约 4 MB）。
修改：`app/developer/page.tsx`、`app/platform/developer/page.tsx`、`components/layout/command-palette.tsx`（一个链接）、`features/platform/components/projects-index.tsx`（一个链接）、`vitest.config.ts`（一行）。
删除：`features/platform/components/developer-console.tsx`。
未触碰：`prisma/**`、`supabase/**`、`features/registry/**`、`lib/auth/**`、`middleware.ts`、`app/api/**`、`tests/e2e/**`、`tests/integration/**`、`vercel.json`、`.github/**`、Landing。

## 8. 最短验收路径

1. `/platform/developer`：看项目列表与“下一步”，切换「模拟身份」观察角色列变化。
2. 进入「城市空气质量摘要」发布台：以「你」尝试批准（被拒并提示切换）→ 切换为示例审核人批准 → 切回「你」封存为 v0.2.0 → 在版本列表申请发布 → 以审核人批准 → 以「你」执行发布。看协议日志每一步的 ETag 与幂等键。
3. 「排序算法对照实验」：改一下简介，不保存，点「协作者并发保存」，再保存 → 412 与“载入最新”。
4. 「体数据三维重建」：对 v0.2.0 申请回滚 → 审核人批准 → 执行回滚；撤回当前发布，看项目变为私有。
5. 「时钟快进 16 分钟」与「撤销操作资格」各试一次；在协议日志里重放一条请求。
6. `/platform/developer/access` 按角色筛选矩阵；`/platform/developer/integrate#manifest` 修改 Manifest。
7. 手机宽度重复 1–2。
