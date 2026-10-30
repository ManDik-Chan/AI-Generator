# P1-B2-A：内部 Draft / Review / Version 安全交接

基线为 `main@6a92061`，包含已合并的 P1-B1 / PR #29。本轮在独立分支和工作区实现内部协议，交付范围到不可变 Version 封存为止；不创建 HTTP 路由、Release、公开读取、发布/回滚命令或持久运行协议。现有两个 Demo、AI Hub、前端视觉、Manifest `0.5.0` 与 Demo OpenAPI 保持原入口和行为。

本文件说明已实现的安全机制、使用边界和后续依赖。本轮真实数据库、迁移、质量检查、Node 24 与最终提交 CI 的实际结果统一记录在 [B2-A 验收记录](../registry-b2a-validation.md)，以该记录对应的候选提交、实际日志和 PR 检查为准；不引用 B1 的通过结果替代本轮证据。

## 内部接口与权限

`features/registry/protocol.ts` 是 `server-only` 库，没有 route 调用。所有调用均要求 `REGISTRY_INTERNAL_ACCESS_ENABLED=true` 与 `REGISTRY_DRAFT_REVIEW_ENABLED=true`；缺省或其他取值拒绝。两个 flag 本身不能代替当前身份、资格和项目授权。

| 函数 | 独立操作资格 | 项目角色 | 输出或效果 |
| --- | --- | --- | --- |
| `getRegistryDraftHead` | `READ_DRAFT` | 任意活动成员角色 | id / projectId / revision / state 与强 ETag；可读取 B1 尚未初始化的 Draft 头 |
| `getRegistryDraft` | `READ_DRAFT` | 任意活动成员角色 | 严格 `DraftDTO`；空 B1 payload 返回 `DRAFT_UNINITIALIZED` |
| `getRegistryReview` | `READ_DRAFT` | 任意活动成员角色 | 白名单 Review 数据、历史 decision 与当前 effectiveState |
| `editRegistryDraft` | `EDIT_DRAFT` | OWNER / EDITOR | 完整严格 payload 替换、revision CAS、旧审核失效 |
| `submitRegistryDraft` | `SUBMIT_REVIEW` | OWNER / EDITOR | DRAFT → IN_REVIEW；绑定内容、资产、epoch、策略与期限 |
| `withdrawRegistryReview` | `WITHDRAW_REVIEW` | OWNER / EDITOR | 追加失效事实、返回可编辑 DRAFT；不覆写已批准的 Review |
| `decideRegistryReview` | `DECIDE_REVIEW` | REVIEWER | 独立 APPROVED / REJECTED 决策；reviewer 不能是 submitter |
| `sealRegistryVersion` | `SEAL_VERSION` | OWNER / EDITOR | 原子封存 Version 与文档引用，将 Draft 冻结 |

项目 OWNER、已有 Profile.ADMIN、登录或 `user_metadata` 均不自动获得上述六项全局操作资格。资格分别存于 private `internal_operators` 与 `operator_actions`，均需 active 且未到期。迁移不授予真实主体资格、不提供自助授权入口。

每次调用先由 Supabase Auth 验证 token，再从已验证 token 中读取 sub / session_id / exp。事务中核对 `auth.sessions` 的 id、user_id、not_after 和 JWT 到期时间，并持共享锁；调用前后均检查当前会话与调用者权限。封存还跟踪原 submitter/reviewer 的动作资格与审核 deadline，在 Draft 冻结和 receipt 写入之后、提交前，用同一数据库时钟统一复检，避免仅重查调用者而漏过其他参与者在最后写入期间的自然到期。撤销会话、资格、动作或成员资格后，旧 JWT / 旧成功回执不能绕过校验。此处比 B1 单纯 `getUser` 的会话边界更严格，不把此保证错误归到旧创建函数。

## DTO、CAS 与幂等边界

契约、原始 JSON 严格解析和跨语言向量说明见 [registry-b2a-contracts.md](../registry-b2a-contracts.md)。DraftDTO 仅含 id/projectId/revision/state/payload；VersionDTO 仅含版本快照、真实 JCS 哈希、审核引用和时间等白名单字段。结构字段不接受 owner、storageRef、credential、远端执行地址或未知字段；自由文本没有自动秘密识别或 Markdown 净化保证。

写命令要求 `ifMatch` 与 `idempotencyKey`。ETag 为包含双引号的 `"draft:<uuid>:<revision>"`；无条件请求拒绝，弱 ETag、非法值及过期 revision 不会写入。事务锁定同一项目，并在 PostgreSQL Serializable 隔离下执行、有限重试序列化/死锁冲突。CAS 保护内容 revision，动作授权与 epoch 另外实时校验。

`registry_private.command_receipts` 以 project / actor / key 唯一绑定 action、规范请求哈希、预期 revision、授权 epoch 与结果；回执和操作效果同事务提交。相同 key 的不同请求或动作返回 `IDEMPOTENCY_CONFLICT`。相同请求的响应丢失可重放原结果，不能再次递增 revision 或新增 Version；不同主体/项目的 key 相互隔离。

每次回执命中仍先重新检查 Auth 会话、全局动作和项目角色；旧 epoch 返回 `REPLAY_STALE`。SUBMIT / DECIDE 的历史成功回执在审核已撤回、失效或过期时也返回 `REPLAY_STALE`，不得用缓存的 APPROVED 掩盖当前失效。WITHDRAW 可恢复原撤审响应；SEAL 可恢复已封存的不可变 Version，但仍须重新验证本次调用者。回执不是新的发布授权。

## 审核与 Version 的安全含义

内容哈希是完整 DraftPayload 的 RFC 8785 canonical UTF-8 SHA-256，不是 PostgreSQL jsonb 文本或任意 `JSON.stringify` 的哈希。客户端的 `expectedContentHash` 只用于一致性检查，可信摘要由服务端重新计算。

提交时固定 draft revision、project authz epoch、Manifest 目标 visibility、当前资产 digest set、submitter、固定 `REGISTRY_POLICY_REVISION=1` 和数据库时钟起算的 15 分钟有效期。决策/封存重新检查这些绑定，以及原 submitter 的 SUBMIT_REVIEW、独立 reviewer 的 DECIDE_REVIEW 资格和项目角色；资格自然到期即使没有 UPDATE/epoch 事件也会拒绝。资产引用覆盖正文文档、图片、科研证据、Markdown 来源与已报告指标，必须同项目、APPROVED、CURATED、用途匹配 MIME，delivery digest 与 rights/provenance 摘要保持一致。

已批准/拒绝的 Review 不被改写。撤审或编辑导致的有效性变化记录为 private `review_invalidations`；新增 SQL guard 与项目锁确保失效审核不能用于插入 Version/Release。`getRegistryReview` 的 `decision` 是历史事实，`effectiveState` 才表示当前是否有效；Version 已成功封存时返回 `SEALED`，不将 Draft 的内部冻结状态误报为审核失效。

封存中的文档行使用 payload 的 document id，和 Version 在同一事务插入。B1 的 document id 是全局主键；新版本须使用新的文档 UUID，不能复用旧 Version 的文档 ID。冲突返回 `CONFLICT`，不泄露占用该 ID 的其他项目。版本号冲突、文档冲突或后续校验失败必须整体回滚本次 Version、文档和回执。

Draft 状态 `PUBLISHED` 在这里沿用 B1 枚举，含义仅是已冻结到 Version。B2-A 不插入 `project_releases`，不设置 currentReleaseId，不改变 Project.PRIVATE，也不把 `SEALED` 视为可对外发布。Manifest 内的目标 visibility 不自动赋予公开访问。现有 `source.ts` 与 Demo 静态能力登记没有切换到这些内部行。

## 数据库与真实验收矩阵

新增迁移 `20261030174407_registry_draft_review_commands` 在 B1 的 23 项有序迁移之后增加 private 操作资格、命令回执和审核失效事实及 guard。它不改历史迁移或旧枚举，不增加第九个产品实体。三张新 private 表启用 RLS、无客户端策略，对 PUBLIC / anon / authenticated / service_role 撤销表权限；所有新 helper 为 invoker、固定空 search_path、撤销公开 EXECUTE。回执/失效事实只能追加。

新套件 `tests/integration/registry-protocol.integration.test.ts` 使用真实 Supabase Auth 签发的 JWT、真实 session_id 与 PostgreSQL，沿用现有隔离环境守卫，不能用 mock Auth / SQLite / 单测替代。原 B1 与 P1-A 断言保持不变；统一安全 runner 自动发现新增套件，并将 skip / TODO / 空套件视为失败。

| 验收组 | 新套件覆盖 |
| --- | --- |
| 默认关闭与 DTO | 两个 flag 独立默认拒绝、初始空 Draft 只读头、严格字段白名单、伪造 owner/storageRef/project、重复 JSON key / 非法 Unicode |
| 身份与动作 | 伪造 JWT sub/role/alg、ADMIN/metadata 提权失败、项目角色与独立动作分离、撤销/到期会话即时拒绝 |
| 租户隔离 | 跨项目 Draft/Review/资产引用、其他项目 reviewId 封存失败；不能从错误中得到其他项目 DTO |
| CAS 与并发 | 缺失/弱/旧 ETag、两个编辑者同 revision 竞争、同 key 同时请求只提交一次、键的 actor/project 作用域 |
| 幂等与撤权 | 响应丢失恢复、改 body/action 的 key 重用冲突、资格/成员/动作撤权后拒绝回放、恢复资格不复活旧 epoch |
| 审核与失效 | 提交冻结、自审拒绝、竞争决策不覆写历史、批准后撤审保留原行、撤审后旧批准回执失效 |
| 新鲜性 | 原 reviewer 的资格/动作自然到期、撤权再授予、错误策略 revision、真实 DB 时钟审核过期、存储审核哈希与 canonical payload 不符、批准资产退休；最后冻结写入期间 reviewer action / Review deadline 到期也整体回滚 |
| 封存 | 撤审与封存竞争串行化、canonical Version 与文档原子封存/不可变、响应重放不重复建 Version、无 Release/visibility/current pointer 副作用 |
| private 基础 | 三表真实 ACL/RLS、不能通过 PostgREST/RPC 获取回执或调用命令、不可变回执/失效事实、动作资格不可删除 |

测试只创建 synthetic accounts/projects。两项终端过期负例在测试事务中安装只匹配本 fixture project 且仅匹配 IN_REVIEW → PUBLISHED 的临时 trigger，延迟 5.2 秒；资格或审核提前设为数据库当前时间加 5 秒。用例确认实际命令耗时跨过延迟后，Version、Draft 和 seal receipt 全部回滚；finally 精确删除该 trigger/function 并核对不存在。没有全局无条件 sleep，也没有把测试 helper 装入 migration 或 runtime。

清理在已验证的可丢弃库中，以事务局部 superuser trigger bypass 删除本套件记录的 UUID；runtime 不包含删除或 bypass 入口。原有 69 项数据库验收不被跳过，新套件结果需单独核对实际计数。非数据库 `pnpm test` 跳过集成用例的结果不是安全验收。

验收要求包括空库、B1 升级、故障注入回滚、重复 deploy、全部迁移 checksum、真实 JWT/RLS/GRANT、原 P1-A 回归，以及 lint/typecheck/unit/build/Node 24 和当前六项 required CI。浏览器仅沿用已授权的远端隔离 CI，本地按 AGENTS.md 禁止启动或连接浏览器。实际执行结果、候选 SHA、测试合并父节点和 job 链接以 [B2-A 验收记录](../registry-b2a-validation.md) 为单一来源；本节的覆盖矩阵不是通过声明。

## 剩余风险与 B2-B 顺序

1. **仍没有对外接口。** 新增 HTTP 接口前需明确路由认证、严格 UTF-8 字节解码、大小限制、错误映射、限流与幂等头；不能直接把 Prisma 行或 private 回执变成 DTO。既有 OpenAPI 不能提前把设计路由标为已部署。
2. **SEALED 只是审核历史。** B2-B 的 publish/withdraw/rollback 必须独立核对当前主体、动作、成员、资产、policy、epoch、Version 内容与审核有效性，不能用 SEALED 或旧命令回执直接发布。B2-A 不承诺公开 Release 的资格撤销投影。
3. **资产记录不等于存储服务。** CURATED / APPROVED / rightsRef / provenance 是受信的内部登记基础，不证明对象内容已扫描、脱敏、持久存在、版权获准或来源已隔离。上传、净化、授权证据与独立 origin 仍需单独闭环。
4. **固定策略的演进需有协议。** 当前 policy revision 是代码常量、Review TTL 固定。后续策略变更、动态配置、审计保留、旧审核失效与重新审批要在新交付中明确定义，不直接修改不可变 review binding。
5. **数据库 owner 仍可信。** 它能修改 schema/禁用 trigger，不能当作不受信用户隔离。敏感连接保持 server-only；不得增加任意查询/写入或测试 bypass 的生产入口。
6. **发布与对象存储不同事务。** B2-B 先定义 ReleaseDTO、幂等 publish/withdraw/rollback 状态机和失效投影，再设计对象激活与清理重试；回滚新建审核/Release 历史，不修改旧 Version、不复活撤回 URL。
7. **运行协议保持另立范围。** 现有 Demo 同步 200/JSON/SSE、`aig.capability/0.1`、`aig.worker/1` 与 Run Lifecycle 不改为异步 202；持久任务、Grant、第三方执行、BYOK、GPU 都不是本次功能。

建议下一交付依赖顺序：批准 B2-A → 独立授权 B2-B 发布动作与当前有效性协议 → 资产服务/独立 origin 闭环 → 严格公开 ReleaseDTO 与 fail-closed 目录/项目读取 → 最后切换既有数据源。每一步独立验收；本轮交付后停止，不自动启动 B2-B。

## 生产迁移与回退计划（未执行）

本轮只授权隔离开发与验证。B1 已确认 main Git 合并会触发 Vercel 自动部署；当前分支禁用设置只约束对应分支，不能代替未来 Owner 对 main 自动发布、dashboard build/install override 或外部 webhook 的检查。仓库正常 install/prebuild 只生成 Prisma Client，数据库迁移为独立命令；本轮不添加部署时自动执行 migration 的路径。

未来任何 main 合并前，由 Owner 先确认最终提交/CI、备份和迁移窗口，并处理 Git 自动发布与数据库操作的先后关系。生产盘点/查询、迁移、部署和 main 合并均需各自授权，不能由本文件代为执行。应用与数据库入口在审批前保持两个 flag 关闭，不从本地测试导入 operator/action 种子。

获批准后，生产执行者先比对既有迁移顺序与 checksum，只应用缺失的新迁移；不改历史、不 reset、不 db push、不加载测试 seed。新迁移事务失败仅回滚该条，B1 已提交的表和权限保留。已提交后的回退首先关闭两个 flag 并回退应用，保留新表、ACL、回执、失效事实及 Version/Review 历史；不删表、不关闭 RLS、不授客户端写权限。schema 修复采用新的前向迁移，灾难恢复另依批准的备份/PITR 方案处理。
