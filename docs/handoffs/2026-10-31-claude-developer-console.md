# 交接：P1-D 开发者控制台前端（Claude，2026-10-31）

> 分支 `claude/p1-d-developer-console-20261031`，基于 `origin/main` `aef7316`（含 PR #37 / P1-B2-A）。独立 worktree，未使用 Codex 未合并分支作为基础。
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
| 研究笔记工作区 | 私有、B1 空草稿、只有一名成员 | `DRAFT_UNINITIALIZED`、首次编辑、私有版本不能发布、没有第二人就无法独立审核 |

- **模拟身份**：你 / 示例协作者 / 示例审核人 / 示例访客成员。按钮在缺少角色或违反独立性时说明原因，提供“一键切换为能做这件事的人”，以及“仍然发送，查看拒绝响应”。
- **模拟环境**：协作者并发保存（你手里的 ETag 过期）、时钟快进 16 分钟（审核/发布申请过期）、撤销或恢复当前身份的平台操作资格（epoch 推进，旧审核不复活）、重置示例数据。
- **协议日志**：每个请求对应的库函数名、If-Match、Idempotency-Key、input、响应或稳定错误码；可用同一个幂等键重放（`replayed: true` 或 `REPLAY_STALE` / `IDEMPOTENCY_CONFLICT`）。

## 2. Mock 边界

所有 Registry 数据来自 `features/developer-console/mock/`，**只在浏览器标签页内存中，刷新即重置，不调用任何服务、不写任何存储**。每个控制台页面顶部固定显示「Mock 数据源 · 不保存」，项目标注「示例项目 · Mock」。

| 部分 | 依据 | 标注 |
| --- | --- | --- |
| 草稿、审核、版本（编辑/提交/撤审/决定/封存） | 已合并的 `features/registry/protocol.ts`：检查顺序、强 ETag、CAS、幂等回执、独立审核、15 分钟期限、epoch/资格新鲜性、错误码与状态码、B1 trigger 的 revision 递增 | 已合并契约 |
| 发布（申请/批准/发布/撤回/回滚） | 未合并的 `codex/p1-b2-b-release-20261031` 中 `docs/registry-b2b-release-contracts.md` 的草案，**只读参考，未引入其代码** | 暂定契约 |
| 开始下一版草稿 | 没有任何契约 | 契约缺口 |
| Demo API、OpenAPI、Manifest 校验、两个 Demo | 真实实现 | 已上线 |
| BYOK / Grant | 未实现；页面上没有任何密钥输入框 | 规划中 |

真实性约束：

- 种子 payload 与封存版本在单测中逐个通过真实的 `draftPayloadSchema` / `validateDraftPayload` / `draftDTOSchema` / `versionDTOSchema`（后者会重算 JCS 哈希）。
- 浏览器端内容哈希 `content-hash.ts` 是为 Mock 写的最小 RFC 8785 + SHA-256；单测要求它对全部种子 payload 与 `tests/fixtures/registry-jcs-vectors.json` 的 5 个固定向量与 `hashSnapshot()` 逐字节一致。它不是安全边界，真实 Adapter 不应在浏览器计算哈希（见 C-1）。
- `permissions.ts` 的 `DRAFT_ROLES` 有单测直接解析 `protocol.ts` 源码中的私有 `roles` 映射，两者不一致即失败。
- 「权限与隐私」页的 DTO 字段由服务端组件直接读取 `contracts.ts` 的 zod schema 生成。
- 「接入」页的 Demo API 操作由 `buildOpenApiDocument()` 生成。

Mock 与真实协议的已知差异：身份可切换（真实环境中就是登录账户）；不检查资产引用（种子 payload 不引用资产）；不检查请求体字节大小与 Unicode 细节；HTTP 成功状态码未定义，日志里只写“成功”。

## 3. 接口依赖与契约需求（交 Codex 决定）

前端没有修改任何 API / DTO / 数据库。接入真实接口前需要以下契约，按优先级：

| # | 需求 | 原因 |
| --- | --- | --- |
| C-1 | Draft 读取（head 或 DraftDTO 响应）返回服务端计算的 `contentHash` | `submit/decide/seal` 都要求 `expectedContentHash`，但 DraftDTO 不含哈希；否则前端必须自己实现 JCS |
| C-2 | 从非 server-only 模块导出 Review DTO 的类型与 schema（`reviewDTO()` 的形状） | 控制台目前在 `model.ts` 手写镜像 |
| C-3 | Review / 发布申请返回相对当前调用者的布尔值：`submittedByViewer`、`requestedByViewer` | 不泄露身份的前提下，界面可以在发送前说明“不能审核自己的提交”；否则只能发送后显示 FORBIDDEN |
| C-4 | 把动作 → 角色映射从 `protocol.ts` 的私有常量导出到可共享模块 | 前后端共用一份；现在靠源码解析单测防漂移 |
| C-5 | “从某个 Version 开始下一版草稿”的命令 | B2-A 封存后草稿冻结，没有命令能创建新草稿，项目经协议只能产生一个版本 |
| C-6 | 列表读取：项目列表（当前用户可见）、版本列表、按草稿列出的审核、发布头与发布历史、当前用户在项目中的角色 | B2-A 只有 `getRegistryDraftHead`、`getRegistryDraft`、`getRegistryReview(id)` |
| C-7 | 当前用户自己的平台操作资格（动作 + 到期时间，只读） | 解释第二道门；不暴露他人资格 |
| C-8 | 内部 HTTP 映射：路由、成功状态码、响应信封 `{ result, etag, replayed }`、`If-Match` / `Idempotency-Key` / `ETag` 头、错误体 `{ code }` | `model.ts` 的 `CommandResult` 按库返回值设计，可直接对应 |
| C-9 | B2-B 合并后复核：请求输入形状、申请状态字段（`state`、`approvalId`、`expiresAt`）、`APPROVAL_INVALID`、私有版本不能申请发布（Mock 假设）、撤回历史 Release 时 revision 也前进（Mock 假设） | 发布部分按草案模拟 |

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
| `pnpm test` | 164 文件 / 1124 项通过；100 项需隔离数据库的集成测试照旧跳过。新增 3 个文件 / 51 项 |
| `pnpm build` | 通过；`/platform/developer`、`/integrate`、`/access` 静态预渲染，四个发布台 SSG；`/developer/*` 为动态 |
| 预渲染 HTML 静态检查 | 7 个演示页面标题正确、均含「Mock 数据源」、无 `undefined` / `NaN` |
| 客户端包检查 | `.next/static` 中没有 `registry_private`、`internal_operators`、`PrismaClient` 或服务端密钥名；Registry 模块只以 `import type` 进入客户端代码 |

新增测试：

- `content-hash.test.ts`：SHA-256 对比 node:crypto；canonical JSON 对比 5 个 JCS 固定向量；全部种子 payload 与 `hashSnapshot()` 一致。
- `mock/engine.test.ts`：种子满足合并契约；完整流程与 revision 递增；428/422/412；失败回滚；幂等重放与键冲突、键按 actor 隔离；并发编辑；角色缺失返回 NOT_FOUND；自审 FORBIDDEN；审核过期；资格撤销与恢复；撤审；未初始化草稿；跨项目 payload；撤回当前发布 → 私有；回滚创建新 Release、PUBLISH 不能消费 ROLLBACK 批准；发布头变化使批准失效；私有版本不能发布；开始下一版草稿；角色映射与 `protocol.ts` 一致。
- `components/render.test.ts`：在 Node 中服务端渲染全部四个页面与四个项目的发布台，检查不抛错、不输出 `undefined`/`NaN`、带 Mock 标识、两次渲染完全一致（避免水合不一致）、倒计时与权限提示存在、DTO 字段来自合并契约。

为让组件测试能导入 `.tsx`，`vitest.config.ts` 增加了一行 `oxc.jsx.runtime = "automatic"`（tsconfig 为 Next 保留 `jsx: "preserve"`）。不影响现有测试。

## 6. 未验证与风险

- **没有打开任何浏览器、没有截图、没有运行 E2E**：`AGENTS.md` 规定在 Owner 再次明确授权前禁止浏览器自动化，本次任务说明中的“输出截图”“检查桌面与移动端效果”不构成恢复授权。真实渲染、动效、响应式断点、深色模式、触屏、键盘焦点顺序需要 Owner 在本地或 Preview 上亲自查看，或明确授权一次受控的单实例截图。可访问性在代码层面处理：语义标题与 landmark、表格 `scope`、`aria-current="step"`/`"page"`、`aria-live` 结果区、原生表单控件与 label、状态同时用文字表达、沿用全局 `prefers-reduced-motion`。
- 现有 E2E 不访问开发者控制台页面，CI 中不会因本 PR 新增浏览器用例；也没有为控制台新增 E2E。
- 发布部分基于未合并草案，B2-B 合并后可能需要调整 `mock/engine.ts` 的发布分支与 `model.ts` 的发布类型（C-9）。
- `features/platform/demo-projects.ts` 仍把两个 Demo 的 1.0.0 标为 IN_REVIEW（PR #36 已合并）。工作台只展示 Demo 的运行状态，没有引用这个字段；是否改为 PUBLISHED 由 Owner 决定（上一份交接第 8.5 项）。

## 7. 改动范围

新增：`features/developer-console/**`、`app/platform/developer/{layout,integrate,access,projects/[slug]}`、`app/developer/{layout,integrate,access,projects/[slug]}`、本文件。
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
