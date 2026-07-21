# 独立安全与架构审计（2026-07-22）

## 范围与结论

审计基线为 `main` commit `fc38a195`。同时审阅了未合并的 Draft PR #21（Agent 终态同步，head `4eff45ee`）和无关的旧 PR #1。PR #21 的 owner-scoped terminal hydration 能修复页面刷新/后台返回后的 UI 对账，但不会让 Vercel 中断的 Promise 续跑，也没有队列、lease、heartbeat 或 checkpoint。

结论：`main` 存在可由普通 authenticated JWT 直接利用的管理员自提权、运行状态伪造/删除和额度恢复漏洞，均为 P0。第一批修复仅处理这些边界、版本化迁移和真实测试入口；Agent 耐久执行、上传架构、复合约束、安全响应头与可观测性留给后续独立 PR。

| ID | 等级 | 状态 | 摘要 |
| --- | --- | --- | --- |
| P0-1 | Critical | 隔离 Supabase 真实 JWT 已通过；Production 未核对 | Profile 全列 UPDATE 允许 role 自提权 |
| P0-2 | Critical | 隔离 Supabase 真实 JWT 已通过；Production 未核对 | 浏览器可伪造/删除 Message、ToolRun、ToolAsset、Embedding 状态 |
| P0-3 | Critical | 隔离 PostgreSQL 删除/并发测试已通过 | 可删除历史是唯一额度依据，聊天检查还位于事务外 |
| P0-4 | Critical | 干净库、旧库增量与事务回滚已通过；Production 未执行 | RLS/grants 依赖手工 SQL，结构与授权可漂移 |
| P1-1 | High | 未修复 | `waitUntil`/`after` 不提供跨实例任务恢复 |
| P1-2 | High | 未修复 | Provider 调用与数据库 reserve/finalize 之间存在不确定窗口 |
| P1-3 | High | 未修复 | 10 MB 上传超过 Vercel Function 4.5 MB 请求体上限 |
| P1-4 | High | 未修复 | Persona/图片/ToolAsset/Memory 等复合所有权约束不完整 |
| P1-5 | High | 部分修复 | 缺少实际执行的 PostgreSQL、Supabase RLS、并发和登录态 E2E |
| P2-1 | Medium | 未修复 | 缺少 CSP 与主要安全响应头 |
| P2-2 | Medium | 未修复 | 缺少 tracing、结构化成本统计和全局并发控制 |
| P2-3 | Medium | 未修复 | Storage bucket/path 及 Worker 状态时间组合约束不足 |
| P3-1 | Low | 部分修复 | 文档与源码字符串契约测试曾制造错误安全确信 |

## P0-1 Profile role 自提权

- 问题：`origin/main:prisma/rls.sql:22-24` 的 own-row UPDATE policy 没有列限制；Supabase authenticated 默认表授权可让 REST/SDK PATCH 自己整行。
- 路径：普通 JWT 把自己的 `profiles.role` 从 `USER` 改成 `ADMIN`；`lib/auth/session.ts:28-36` 和 `app/admin/page.tsx:43` 信任该字段；随后 `features/admin/actions.ts:25-40` 可修改其他账户角色。
- 影响：管理员页面、无限额度和角色管理全部失守；最后管理员保护不能阻止攻击者先新增自己为管理员。
- 修复：migration 收回 Profile 全表 UPDATE，只授予 `display_name`、`avatar_url`、`memory_enabled` 列级 UPDATE；触发器二次保护 id/email/role/时间字段。
- 风险：已有浏览器代码若直接更新未允许列会收到 42501；服务端 Prisma 连接不受 authenticated 列授权限制。
- 验证：`tests/integration/rls.security.integration.test.ts` 以 `SET LOCAL ROLE authenticated` 和 JWT claims 实际 UPDATE role，必须失败；允许列必须成功。当前无测试库，未执行。

## P0-2 运行状态可伪造或删除

- 问题：`origin/main:prisma/rls.sql:137-150` 给 Message `FOR ALL`；`:71-79` 给 ToolRun INSERT/UPDATE/DELETE；`:84-98` 给 ToolAsset 写权限；`:43-57` 给 MemoryEmbedding 写权限。
- 路径：authenticated 客户端可伪造 AI 回复、COMPLETE/ERROR/CANCELLED/PENDING，修改 ToolRun 或删除计费历史；若某个 migration 没有同步最新手工 RLS，新增运行表还可能处于无保护状态。
- 影响：运行真相、审计、历史和配额不可相信，并可能制造跨流程孤儿或误导 UI。
- 修复：除 Profile 白名单列外，所有应用数据表对 authenticated 统一为 select-own；所有 mutation 仅由可信服务端连接执行；显式 REVOKE 同时阻断直接写与通过 Conversation 删除触发的级联旁路，比只有 RLS policy 更强。
- 风险：任何依赖浏览器直写这些表的隐藏路径会中断；代码审查未发现合法客户端写入需求。
- 验证：真实 RLS 测试检查每表 SQL privileges，并实际尝试 INSERT Message、UPDATE ToolRun、DELETE UsageLedger 和跨用户访问。当前无测试库，未执行。

## P0-3 删除历史与并发绕过额度

- 问题：`origin/main:app/api/chat/route.ts:77-86` 统计可删除 USER Message，且检查在事务外；`features/tools/usage.ts:26` 等统计可删除 ToolRun；`features/agents/creation.ts:41-52` 统计可删除 AgentRun。
- 路径：用户删除 Conversation/Message/ToolRun/AgentRun 后额度恢复；并发请求可在任一写入前同时看到旧计数。自提为 ADMIN 后还可完全绕过限制。
- 影响：聊天、图片、文本工具、Brainstorm 与 Agent Credits 都可能被免费重复使用，成本数据随历史删除而消失。
- 修复：新增 append-only `UsageLedger`，按 capability 分账；quota read 和 ledger reservation 与 run/message 创建位于 Serializable 事务；`(user, capability, run)` 与 idempotency key 双唯一；ADMIN 仍记录。
- 风险：Serializable 冲突目前返回 409，调用方需要重试；现有历史回填是按记录次数估算，不含旧 Provider token/cost；运行接受后失败仍计一次额度，延续旧语义。
- 验证：真实 PostgreSQL 测试删除 Conversation/ToolRun 后账本不变、并发限额 1 只能成功 1 个事务、同 run 不能重复入账、ADMIN 留账。当前无测试库，未执行。

## P0-4 授权部署漂移

- 问题：`README.md:32`、`docs/authentication.md:25` 和历史部署说明要求 migration 后手工复制完整 `prisma/rls.sql`。
- 路径：发布者漏执行、执行旧副本或中途失败时，Prisma schema 已升级但 RLS/grants/trigger 停留旧版本；代码测试无法发现实际数据库权限。
- 影响：新增表可能裸露，旧危险 grants 长期保留，环境之间不可复现。
- 修复：所有 P0 RLS、grants、trigger、check、FK 和 index 进入新版本化 migration；保留幂等 `prisma/rls.sql` 仅作灾难恢复基准。
- 风险：权限收紧与账本回填需要维护窗口；必须先迁移再发布读取账本的新应用。
- 验证：从干净 Supabase 和已有迁移链各执行一次 `migrate deploy`，核对 `pg_policies`/grants/回填数量，再重复恢复脚本。当前没有数据库工具或连接，未执行。

## P1-1 Agent 不是耐久任务

- 问题：`features/generation/background-task.ts:25-28` 只把已经运行的 Promise 注册给 `waitUntil`，`after` 只是本地 fallback；`app/api/agents/route.ts:15` 的 300 秒函数承载 Planner→Worker Pool→Leader 全链。
- 路径：实例回收、部署、崩溃或超时会终止内存 Promise。`features/agents/run-state.ts:164` 仅在后续轮询时把 stale run 标为 ERROR；没有消费者继续 Worker 或 Leader。
- 影响：可能永久 PENDING（无人再查询时），或最终失败但已产生 Provider 成本；Worker 完成/Leader 未启动与 Leader 部分输出都无法恢复。
- 修复：后续独立 PR 引入 durable queue/workflow、数据库 lease、heartbeat、阶段 checkpoint 和可重入 step；每 step 以稳定 idempotency key 调 Provider。
- 风险：任务系统重写范围大，应先做 shadow worker 与 reconciliation job，不能混入本 P0 PR。
- 验证：真实进程 kill、部署切换、超时和重复投递故障注入；断言最终收敛且每 step 最多一次可计费调用。

## P1-2 Provider/数据库双写不原子

- 问题：`features/agents/events.ts:74-128` 与 `worker-state.ts:22-55` 在 Provider 调用前 reserve 调用次数，这是必要的并发闸门，但数据库事务无法和外部 Provider 原子提交。
- 路径：reserve 成功后崩溃会未调用却占位；Provider 成功后落库前崩溃会丢结果；盲重试可能重复收费，不重试则任务失败。Leader 同样存在该窗口。
- 影响：计数与真实账单漂移、迟到结果丢失、重复调用或无法恢复。
- 修复：step ledger 状态机（reserved/dispatched/completed）、provider request id、outbox/queue、lease fencing token、结果 checkpoint；支持对账但不能宣称 exactly-once 外部调用。
- 风险：Provider 是否支持幂等键取决于供应商；没有支持时只能做到 at-least-once 加去重/成本审计。
- 验证：在 reserve 前后、HTTP 返回前后、finalize 前后逐点故障注入，核对 Provider request id、ledger 和最终状态。

## P1-3 图片上传限制与资源峰值

- 问题：`features/tools/image/processor.ts:6-7,24-42` 接受 10 MB/4000 万像素，route 在 `app/api/tools/image/run/route.ts:32` 先 `request.formData()`，再 `file.arrayBuffer()`；Vercel Functions 当前请求/响应体上限为 4.5 MB。
- 路径：大于 4.5 MB 的请求在到达应用校验前 413；4000 万 RGBA 解码约 160 MB，输入、Sharp/libvips 中间缓冲与输出会进一步放大，多用户并发可耗尽内存/CPU。
- 影响：产品宣传的 10 MB 在生产不可用，并可能引发函数 OOM、延迟尖峰和拒绝服务。
- 修复：后续改为 private quarantine bucket 受控直传，服务端异步嗅探/解码/重编码后 promote；短期把前后端限制降到小于平台上限并计入 multipart 开销。
- 风险：直传需要一次性 upload token、path ownership、过期清理和 quarantine 访问隔离。
- 验证：Preview 上传 4 MB/4.5 MB/10 MB、超大像素压缩图和并发样本，记录 413、内存、CPU 与净化结果。

## P1-4 数据库复合所有权仍有缺口

- 问题：`ToolAsset` 只按 `tool_run_id` 外键（schema 当前约 `ToolAsset.toolRun`）；Conversation 的 persona/user、Persona 的 `avatar_image_id`、GenerationRun 的 persona/user、Memory 的 persona/source、MemoryEmbedding 的 memory/user 也未全部使用复合 FK。应用校验不能替代数据库不变量。
- 路径：可信服务端的未来 bug、脚本或误操作可把 A 的资源绑定给 B，或把 `TOOL_GENERATION` 当 Persona 头像；Storage bucket/path 也可写入不期望值。
- 影响：跨用户引用、错误删除级联、signed URL 指向错误对象、数据修复困难。
- 修复：后续 migration 先审计/清理孤儿，再增加 `(id,user_id)` unique 与复合 FK、头像/工具图片 kind trigger/check、bucket/path 唯一和格式约束。Memory scope/persona check 已存在；Agent 复合 FK、assistant 唯一和 event sequence unique 已较完整。
- 风险：新增约束前必须扫描生产存量；不可直接修改旧 migration。
- 验证：真实数据库负例矩阵覆盖跨 owner、错误 kind、非法 scope、重复 assistant、非法状态/phase 和并发 event sequence。

## P1-5 测试结构无法证明安全

- 问题：审计时 124 个 Vitest 文件中有 32 个使用 `readFileSync` 检查源码字符串，18 个 Prisma 相关文件全部 mock；两个名为 integration 的旧测试仍是 mock。真实 PostgreSQL、Supabase RLS、并发、进程中断与 Provider 测试均为 0。
- 路径：SQL 可以语法错误、grants 未部署、策略行为错误，字符串测试仍通过；没有 storage state 时登录态 Playwright 整组 skip。
- 影响：测试数字高但不能阻止 P0 回归。
- 修复：新增受三重环境开关保护的一次性数据库测试；CI 缺 `PLAYWRIGHT_AUTH_STATE` 直接失败，不再静默跳过认证场景。
- 风险：CI 必须提供隔离测试 Supabase 和可销毁账号；本地无环境时测试仍会明确 skip。
- 验证：CI 报告必须分别显示实际运行、skip 和未配置；不能把新增文件计作通过。

## P2-1 浏览器安全响应头缺失

- 问题：`next.config.ts:4-7` 仅关闭 `poweredByHeader`，没有 CSP、frame-ancestors、object-src、base-uri、form-action、Referrer-Policy、Permissions-Policy、HSTS、nosniff 和明确点击劫持防护。
- 路径：未来 XSS/第三方内容或 framing 漏洞缺少浏览器第二道防线。
- 影响：凭据滥用、点击劫持和内容注入风险扩大。
- 修复：独立 PR 先在 Report-Only 收集 Supabase Auth、signed image、SSE、RSC 的真实源，再切 enforce；静态安全头通过 `headers()` 配置。
- 风险：过严 CSP 会破坏 Next.js inline bootstrap、图片预览或外部 Auth。
- 验证：Preview 登录/回调/SSE/RSC/图片矩阵、CSP 报告与安全头自动测试。

## P2-2 可观测性、成本与全局并发不足

- 问题：当前主要是 console 事件和 run-level counter，没有 end-to-end trace、稳定 request/provider id、实际 token/cost 回填、定价版本或跨 run 的用户/全局并发闸门。
- 路径：突发请求可同时占满 Provider/DB；事故后无法把账单、run、重试和用户请求准确关联。
- 影响：成本失控、限流困难、诊断慢。
- 修复：UsageLedger 已预留 provider/model/tokens/cost/pricingVersion；后续接入结构化日志、OpenTelemetry、provider response usage、per-user/global semaphore 与告警。
- 风险：日志必须脱敏，不记录 prompt、JWT、signed URL 或用户正文。
- 验证：并发压测、采样 trace、账单抽样对账和日志敏感信息扫描。

## P2-3 Storage 与状态组合约束不足

- 问题：Storage path/bucket 缺少统一唯一/格式约束；AgentRun 有 terminal phase check，但 Worker status 与 started/completed/error 字段缺少完整组合 check。
- 路径：服务端 bug 可产生 RUNNING 无 startedAt、COMPLETE 无 completedAt、重复 path 或任意 bucket。
- 影响：恢复器误判、对象覆盖/泄漏和无法清理。
- 修复：清理存量后用新 migration 增加状态-时间 check、bucket allowlist、owner-prefixed path regex 和必要 unique index。
- 风险：历史异常行会阻止加约束，必须先只读盘点。
- 验证：数据库负例测试和并发写入测试。

## P3-1 文档与契约测试的错误确信

- 问题：旧文档声称“客户端不能修改 role”，但数据库实际允许；历史部署文档把人工 RLS 当正常步骤。大量字符串测试只证明文本存在。
- 路径：审查者依据文档或测试数量跳过真实 JWT/数据库验证。
- 影响：安全回归长期未被发现。
- 修复：当前文档改为版本化授权部署并明确未执行项；旧历史说明加 superseded 标记；契约测试保留作静态护栏但不再称为集成测试。
- 风险：历史文档仍有过期段落，后续应统一归档而非批量改写事实记录。
- 验证：发布清单要求附真实环境测试输出、migration SHA 和 grants 快照。

## 测试分类与本机实际结果

按文件互斥分类，当前 127 个 Vitest 文件包括：74 个纯函数/模块行为单元测试，32 个读取源码字符串的契约测试，19 个 Prisma/mock 行为测试，1 个真实 PostgreSQL usage/concurrency 套件，1 个真实 Supabase Auth JWT/PostgREST RLS 套件。后两类共 10 个测试需要一次性、已完成 migration 的隔离数据库。

Playwright 有 5 个 spec、60 个跨项目用例，覆盖 Chromium desktop、Chromium mobile 和 WebKit iPhone；其中 3 个 spec 依赖登录 storage state，2 个覆盖公开/响应式页面。CI global setup 通过隔离 Supabase Auth 创建一次性用户并生成 storage state；缺少环境时 CI 直接失败。没有真实 Provider 或进程级 Function 中断套件。

本机执行结果：

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，lockfile 无变化 |
| `pnpm lint` | 通过，0 warning |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 651 passed；10 skipped（本机无隔离 DB/RLS），不能把 skipped 计为通过 |
| `pnpm build` | 通过，Next.js 生产构建成功 |
| `pnpm exec prisma validate` | 通过；只验证 schema，不连接数据库 |
| `pnpm audit --prod` | 通过，0 known vulnerabilities |
| `pnpm test:integration` | 本机未执行：1 file / 5 tests 全部 skipped，无一次性 `TEST_DATABASE_URL`；CI 隔离 PostgreSQL 为 5 passed |
| `pnpm test:rls` | 本机未执行：1 file / 5 tests 全部 skipped，无隔离 Supabase；CI 真实 Auth JWT/PostgREST 为 5 passed |
| `pnpm test:e2e` | 本机 15 个公开场景 passed / 45 skipped；CI 会创建登录态并运行完整 60 用例，精确结果以 PR 当前 head 的 workflow 为准 |
| 干净库与旧库迁移 | CI 隔离 Supabase 已通过完整链、合成旧数据增量升级和注入失败事务回滚；Production 规模耗时仍未知 |
| CI 缺前置条件负向门禁 | 已验证：缺 Supabase/Auth 前置条件即 exit 1，不再静默跳过 |

## 尚未验证

- Production 当前 grants/RLS、历史异常数据、真实回填耗时与锁窗口未知；隔离环境的小规模合成数据结果不能外推为 Production 容量结论。
- PR #21 尚未合并，PR #22 尚未 rebase 到它的 Agent terminal sync；两者重叠的 Agent/Chat/E2E 文件必须在 #21 合并后重新验收。
- 真实 Provider、进程 kill/Function timeout、Vercel 实例回收与图片平台请求体边界尚未执行；这些不在本 P0 PR 的改动范围内。
- 没有连接 Production、执行 Production migration、修改 Production 环境变量或部署 Production。

## 建议后续 PR 拆分

1. Agent durable execution：queue/workflow、lease、heartbeat、checkpoint、reconciliation 与故障注入。
2. Database ownership invariants：复合 FK、kind/status/storage checks 和存量审计。
3. Upload quarantine：直传、净化、promote、清理与资源压测。
4. Browser security headers：CSP Report-Only 到 enforce，覆盖 Auth/SSE/RSC/signed URL。
5. Observability/cost/concurrency：tracing、provider usage 回填、pricing、全局/用户限流。
6. Test infrastructure：一次性 Supabase、登录态 Playwright、WebKit、Provider sandbox 与 CI 证据保留。
