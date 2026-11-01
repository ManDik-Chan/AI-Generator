# P1-AUTH-A：Chat 生命周期与 Mobile CI 证据

2026-11-01。本记录依据失败的远程 Mobile 产物，先记录可核对的事实，再区分源码推断和修复后的待验收项。没有启动或连接本地浏览器。

## 被测版本与原始证据

| 项目 | 值 |
| --- | --- |
| PR | [#46](https://github.com/ManDik-Chan/AI-Generator/pull/46)，保留其现有评审状态 |
| 失败的 PR head | `8722373a800406b4cf943f1a35292a0f3efad8c3` |
| 实际 CI checkout | `049ae20acff181a0f9bd10e323085d03e2f96892`，`refs/pull/46/merge` |
| 合成树的 main parent | `98acc2d77ac8b02fce403a3d36de2c216281a230` |
| Security Acceptance | [run 41280671675](https://github.com/ManDik-Chan/AI-Generator/actions/runs/41280671675)，attempt 1 |
| Mobile job | [124774164256](https://github.com/ManDik-Chan/AI-Generator/actions/runs/41280671675/job/124774164256) |
| Mobile artifact | `security-authenticated-e2e-chromium-mobile-1`，ID `13072959968`，9,927,732 bytes |
| artifact SHA-256 | `c1e350b8c8562c484f2172283e7141a98425d7cf6d0a7cbeb73e5bfeaa40dfa7`，下载后匹配 |

该次 Supabase 验收、Chromium desktop 和 WebKit 均通过；Mobile 为 34 passed、4 failed、3 个原有桌面专属 skipped。五项 Auth 用例、之前失败的 Memory 两项用例和公共登录页均通过。不能用其他 head 的绿色结果代替本次失败的验收。

实际读取每个失败的 `0-trace.trace`、`0-trace.network`、`test.trace`、`error-context.md` 和失败 PNG。离线解码按固定版本 Playwright 1.61.1 的 `snapshotNodes` 后序编号及跨快照引用规则还原 DOM；没有运行 trace viewer 或执行页面 JavaScript。

原始产物及本地分析只存放于忽略目录 `test-results/pr46-872/`，不纳入 Git。提交此摘要，不提交 Cookie、Token、测试账号或整份 trace。以下路径相对于该忽略目录。

## 四个失败的直接原因

| 用例 | 失败调用 | 直接错误 |
| --- | --- | --- |
| Agent standard | `tests/e2e/mobile/agent-mode.spec.ts:190`，由 `:238` 调用 | `getByLabel("消息内容").toBeEditable()` 匹配两个 textarea |
| Agent cancellation | 同一 helper `:190`，由 `:283` 调用 | 同上 |
| Focus scroll | `tests/e2e/mobile/authenticated-mobile.spec.ts:89` | `getByLabel("消息内容").focus()` 匹配两个 textarea |
| Chat entry performance | `tests/e2e/mobile/chat-entry-performance.spec.ts:14` | 原始 `[data-chat-shell]` 匹配两个 shell |

四份 DOM 均确认：

- 第一个 shell 位于 `<div hidden="" id="S:0">` 内。其 textarea 为 disabled，placeholder 是“正在准备对话”。祖先存在标准 `hidden` 属性，不需要用猜测的 CSS 或 `inert` 来解释隐藏。
- 第二个 shell 是 BODY 下的可见页面副本，没有 `hidden`、`inert` 或内联 `display:none` / `visibility:hidden` 的祖先。它在开始水合时也短暂 disabled，随后启用。
- 最后一个 Focus 快照 `after@call@810` 中，第二个 textarea 已启用；第一个仍在 `S:0[hidden]` 内且 disabled。
- 未发现两个同时可见、可编辑的 Composer。失败发生在无作用域的原始 DOM locator 严格匹配阶段，不能只凭“匹配两个元素”认定用户看到两个输入框，也不能因此跳过可见数量及可编辑性检查。

四张实际失败截图均只显示一个 Chat 页面和一个 Composer。两个 Agent 截图及 performance 截图像素相同，SHA-256 为 `77dd5e2b1bdb334587e7842206750bdedde4ea3f9fb7abafadffb36acc73bb00`；Focus 截图为 `4d8c31185b93b597913f83a471e22656a446dd073b1098d5ca83bbc9a73c682d`，也只显示一个页面。截图是远程 CI 已有产物的离线查看，不是本地截图验收。

对应目录：

| 用例 | 证据目录 |
| --- | --- |
| Agent standard | `agent-mode-authenticated-A-53feb-an-and-resets-the-next-send-chromium-mobile/` |
| Agent cancellation | `agent-mode-authenticated-A-6c68d-cile-through-durable-status-chromium-mobile/` |
| Focus scroll | `authenticated-mobile-authe-d777c--message-or-document-scroll-chromium-mobile/` |
| Chat entry performance | `chat-entry-performance-aut-54be6-itical-bootstrap-is-delayed-chromium-mobile/` |

每个目录含 `summary.json`，仅提取快照时间、数量、相关属性和请求时间；没有将会话值复制进摘要。

## 首次进入的额外 RSC 请求

四条网络记录均有同样的顺序：首次 `GET /chat` → 同一路径 `GET /chat?_rsc=…`（`RSC: 1`）→ 首次 `GET /api/chat/bootstrap`。以下时间以各自首次 document 请求开始为零点，单位 ms：

| 用例 | 同路 RSC 开始 | bootstrap 开始 |
| --- | ---: | ---: |
| Agent standard | 278.179 | 414.255 |
| Agent cancellation | 235.762 | 364.540 |
| Focus scroll | 223.971 | 347.174 |
| Chat entry performance | 228.217 | 347.131 |

两个 Agent 用例和 performance 用例在该额外 RSC 前没有测试脚本触发的 focus 操作。Focus 用例的首次显式 focus 也晚于额外 RSC 请求开始。失败快照先只有隐藏的 SSR 副本，随后出现一个隐藏副本和一个活动副本；三个用例此时活动 textarea 尚在水合准备阶段，之后的截图已经显示正常输入提示。

**证据边界**：trace 没有逐条记录应用的 `pageshow` / `focus` handler 调用，不能把网络时间相关性写成对具体事件来源的直接证明，也不能根据这些短 trace 声称已经观察到用户草稿、滚动位置或生成状态被清空。

## 源码推断与修复契约

失败 head 的 SessionSync 在初始 `pageshow` 和每次 `focus` 都执行 `router.refresh()`。`/chat` 每次服务端渲染又生成新的随机 conversation key。这给有效登录的初次进入和返回焦点增加了整页 RSC 刷新及 ChatLayout 重建的路径；它与上述请求顺序吻合。事件归因及状态丢失风险属于由源码和 trace 共同支持的推断，不是已记录的用户数据丢失事实。

修复应保留真实服务端会话复核，同时避免有效 Session 的整页刷新：

- 初始 `pageshow` 已经过页面服务端检查，不额外刷新；bfcache 恢复、隐藏后恢复及失焦后返回仍复核。
- 焦点、可见性和 bfcache 事件合并在一次进行中的服务端检查内。成功复核保留当前页面、草稿、滚动、bootstrap 和生成状态；无效会话离开受保护页面。
- 继续使用既有 Supabase Auth 与 live session 检查，接口不返回用户数据或凭据，不以客户端缓存状态授予访问权限。
- 服务端将当前 Session 用户与已渲染页面的 viewer 上下文比较；204 表示同一有效用户，401 表示无有效会话，409 表示账号上下文不一致。viewer 提示不授予权限，跨账号时离开旧用户页面。
- 退出标记、多标签页退出、撤销及过期规则继续生效；不改 RLS、注册权限或服务端凭据有效期。
- E2E 先确认恰好一个可见 shell、其中恰好一个可访问 Composer，再确认可编辑，不能用 `.first()`、只筛选 enabled 或扩大 skip 掩盖真正可见的重复页面。
- performance 用例仍须保留原总预算及反馈预算，Composer 可编辑性不能等待非关键 bootstrap 响应。

## 验证状态与限制

已实现的接口和生命周期修复：

- `GET /api/auth/session` 复用原 Server Client 与 `getValidatedUser`。仅在 Auth 和 live `auth.sessions` 检查成功、服务端传入的页面 viewer 与当前用户一致时返回空 `204`；无有效会话为 `401`，账号变化为 `409`，客户端初始化不可用为 `503`。全部响应为 private/no-store，无用户数据或凭据。沿用的验证 helper 对 Auth/DB 错误 fail closed 为 null，因此此类失败也会是 `401`，不能把所有后端故障都称为 `503`。
- `SessionBoundary` 从服务端已验证的用户传入 `viewerId`。请求头 `x-aig-viewer` 仅用于清除旧账号界面，不授予权限；服务端仍独立验证请求 Cookie。账号切换时完整离开旧页面，避免原账号缓存界面保留。
- `SessionSync` 不再调用 `router.refresh()`。普通首次 pageshow/focus 不重复检查；真实返回、最初后台打开后变为可见以及 persisted pageshow 仍检查。同次返回的事件合并；检查期间发生新的离开/返回会排队一次新检查，不能被旧 `204` 覆盖。
- SDK SIGNED_OUT 强制中止旧请求并重新检查；退出标记在合并前优先处理。每次检查有 10 秒超时；卸载/退出/强制检查清理请求和计时器。网络或 `503` 不判定有效，也不无限重试；所有受保护请求仍保留原服务端检查。
- 三组受影响 spec 使用共享的唯一可见 shell/可访问 Composer/可编辑就绪检查。延迟 bootstrap 性能用例使用从原点击开始的单一 1500ms deadline，100ms 反馈和 3000ms bootstrap 延迟不变。新的返回回归要求实际服务端 `204`、同次事件一次请求、草稿保持、bootstrap 一次且无新 Chat RSC 请求。

最终本地静态检查：Typecheck、零警告 Lint、Build、187 个 Node 测试文件 / 1421 项测试通过。14 个真实数据库套件 / 184 项测试需要单独隔离验收；静态运行中的既有跳过不算验收通过。21 个 Chromium Mobile 用例已静态收集，尚未据此声明浏览器通过。

针对 `8722373` 之后的修复工作树，最终提交由 PR 的后续候选标识。推送前本地结果如下，不能与上面失败 head 的 CI 结果混淆：

| 检查 | 结果 |
| --- | --- |
| Typecheck、Lint | 通过；由主任务串行安排最终质量门禁 |
| 完整 Node 测试（未带 DB 环境） | 187 文件 / 1421 tests passed；14 个真实 DB suites / 184 tests 按现有环境机制跳过，由下项独立完成 |
| 使用专属本地 Auth/DB 环境的完整 Build | Prisma generate、Next Build 通过；在真实集成开始前完成，避免 Windows DLL 并行占用 |
| `node scripts/run-local-security-stage.mjs migrate D:/AIGC/p1-auth-a-isolated-20261101` | 通过；26 项已有迁移，没有新增或改写迁移 |
| `node scripts/run-local-security-stage.mjs integration D:/AIGC/p1-auth-a-isolated-20261101` | 14 suites / 184 tests 全部通过，0 failed / pending / skipped |
| 真实 Auth 与会话接口 | 9/9；包括有效会话 204、撤销及到期 401、账号上下文不一致 409；使用真实 Supabase SDK/Auth/PostgreSQL |
| 隔离环境验收后 metadata | 26 个已应用迁移 checksum 匹配；合成账号剩余 0 |
| 远程旧产物复核 | 已完成本记录的四份 trace、截图、DOM 和网络顺序分析，不是修复后的浏览器验收 |
| 修复后本地定向 Mobile | 未执行；Owner 的本地浏览器暂停尚未解除。仅准备了忽略目录中的 21 用例、单 worker、专属进程/账号清理脚本，没有启动它 |
| 修复后完整远程 CI | 提交稳定候选后沿用原完整门禁；本记录此阶段不预先授予通过结论 |

严格集成报告存放于忽略目录 `test-results/security-integration-jbeXZ1/report.json`。后续远程验收须补充实际 tested head / merge tree，并与这些本地结果分别记录。

本轮验收仅操作 marker 对应的 `aig-platform-p1-final-auth-a-20261101` 专属项目。检查合成账号为 0 后，对明确的 project id 执行 `stop --no-backup`；按名称检查，该项目 container、volume、network 均为 0。Docker Desktop 保留，没有停止用户浏览器或其他任务资源。没有设置本地 Mobile 恢复授权变量，也没有运行已准备的浏览器脚本。

AGENTS.md 的本地浏览器暂停仍生效。此处只读取已有 CI 产物，未启动、连接或控制本地浏览器；也未访问生产 Supabase 或使用 Owner 账号。若需要本地定向 Mobile 验收，须先由 Owner 明确恢复资源所有权、单实例和清理规则；等待时间不构成恢复授权。现有 workflow_dispatch 没有 spec/project 筛选输入，不能在不改工作流的情况下把它声称为定向执行；本轮采用原完整远程 CI 继续验收，未创建临时诊断 workflow 或分支。

历史对照：[18d339e 的 run 41276346274](https://github.com/ManDik-Chan/AI-Generator/actions/runs/41276346274) 曾全部通过，实际测试 merge tree 为 `fc1cc04d6725aac4648f2702ea95c86610f52028`。那次说明已修正的公共登录页/Memory locator 用例通过，不保证后来 `8722373` 的其他原始 locator 不受相同生命周期影响。
