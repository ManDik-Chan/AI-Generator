# 交接：P1-RBAC 第二阶段前后端集成（Claude，2026-11-02）

> 此文记录角色写入暂停时的状态。R1–R3 已由 #55 交付，角色调整已接入，现状见 [最终集成交接](2026-11-02-claude-p1-rbac-final-integration.md)。

> 分支 `claude/p1-rbac-integration-20261102`。后端基线为 PR #52 `52fe54c1d3f4aa837e7b58ccf9f365caccf38f29`，以普通合并提交接入 PR #53 `7c09b418a88d281f7c674f3fa12df66e3f82ae1e`；两者的已发布提交均未改写。本分支不合并 `main`，由 Owner 审核。

## 1. 结论

- **已接入：** `/admin` 的「用户与角色」由服务端真实数据驱动（`PlatformRolesSection`），旧 `RoleControl` 已删除，OWNER 类型兼容，Typecheck 恢复通过。Shell 的「系统管理」入口与账户页改用服务端计算的 `canAccessAdmin`。
- **已暂停：** 角色变更写入链路。后端缺少版本号、确认后的成员状态和可区分的错误语义（见第 4 节 R1–R3）。在后端提供之前，页面不传入任何角色变更提交器，目录只读并明确说明「角色调整暂不可用」；没有任何页面或组件导入 `features/admin/actions.ts`，因此 Next.js 不会把该 Server Action 注册为 HTTP 端点。
- **审计：** 写入已由后端实现；读取接口不存在，界面显示「角色变更记录暂未接入」，不显示任何示例数据（R4）。

## 2. 逐字段契约对照

| 项目 | 前端契约（#53 `features/admin/rbac/contract.ts`） | 后端现状（#52） | 本分支处理 |
| --- | --- | --- | --- |
| 平台角色 | `OWNER \| ADMIN \| USER` | Prisma `Role` 同名三值 | 直接映射 |
| 当前登录者 | `viewer.id`、`platformRole` | `requireAdmin()` 的用户与 Profile | `getAdminOverview()` 新增 `actor: { id, platformRole }`，与每行判定来自同一次读取 |
| 能力 `manageRoles` | 能否调整至少部分成员 | `platformCapabilities(role).canManageAdminRoles`（仅 OWNER） | 直接映射 |
| 能力 `viewRoleAudit` | 能否读取审计 | 无此能力、无读取接口 | 恒为 `false`，审计区显示「暂未接入」（R4） |
| 成员基本信息 | `id`、`email`、`displayName`、`joinedAt`、`isViewer`、`activity` | `profiles` 列表（最近 50 名）与 `_count` | 映射；`createdAt` 转 ISO；其他字段经 zod 解析丢弃 |
| `roleVersion` | 每次角色变化都会改变的不透明值，用于冲突检测与同步锁定 | 不存在 | 改为可空：`null` 表示服务端未提供；契约禁止向无版本成员提供调整。没有用 `updatedAt` 或角色名合成版本（R1） |
| `assignableRoles` | 服务端此刻会接受的目标角色 | 仅有 `canChangePlatformRole()` 的允许/拒绝 | 有版本且后端允许时，取后端输入 schema 的 `ADMIN/USER` 去掉当前角色；当前因无版本恒为空 |
| `restriction` | `SELF`、`OWNER_PROTECTED`、`PEER_ADMIN`、`INSUFFICIENT_ROLE` | `SELF_CHANGE`、`OWNER_PROTECTED`、`FORBIDDEN` | `SELF_CHANGE→SELF`；`OWNER_PROTECTED` 原样；`FORBIDDEN` 在 ADMIN 查看 ADMIN 时为 `PEER_ADMIN`，否则 `INSUFFICIENT_ROLE`。仅用于说明文案，判定本身来自后端 |
| 请求字段 | `profileId`、`expectedRole`、`expectedVersion`、`nextRole`、`requestId`（本分支新增） | `FormData`：`profileId`、`role`、`expectedRole`、`requestId`（UUID，幂等） | 前端状态机已按后端语义生成 `requestId`：同一意图重试复用，选择或基线变化即更换。`expectedVersion` 后端尚不接收（R1） |
| 成功结果 | `{ ok: true, member: { id, platformRole, roleVersion } }`，须与请求一致 | `{ status: "success", message }`，无成员状态；重放与「无变化」同为成功 | 前端判为 `CONTRACT_MISMATCH`，不推测成功；写入链路因此暂停（R2） |
| 失败结果 | `{ ok: false, code, currentRole?, retryAfterSeconds? }`，每个码保证未写入 | `{ status: "error", code, message }`；任何未知异常都返回 `CONFLICT` | 码表可映射，但「未知异常→CONFLICT」不能映射为「未写入」，需后端区分（R3） |
| 未登录 / 无权限 | 建议返回码 | `redirect("/login")` / `redirect("/workspace")` | 前端透传 Next.js 跳转，行为安全；返回码为可选改进 |
| 审计读取 | 可选 Feed：执行人、对象、前后角色、时间、结果 | 只写不读；只记录实际生效的变更 | 显示「暂未接入」（R4） |

## 3. 本分支改动

| 文件 | 改动 |
| --- | --- |
| `app/admin/page.tsx` | 用 `PlatformRolesSection` 替换旧区块；数据经 `toPlatformDirectory()` 解析，失败时整块停止显示并记录服务端日志；概览改为「N 名管理员（含平台所有者）」；其余运营区块不变 |
| `features/admin/components/role-control.tsx` | 删除 |
| `features/admin/rbac/server-directory.ts` | 新增，`server-only` 适配器（第 2 节映射）与 `ROLE_AUDIT_FEED_NOT_CONNECTED` |
| `features/admin/data.ts` | 返回值新增 `actor`（加法改动） |
| `features/admin/rbac/contract.ts` | `roleVersion` 可空并加不变量；`RoleChangeRequest.requestId` |
| `features/admin/rbac/role-change-state.ts`、`platform-member-directory.tsx` | 无版本不可打开；`requestId` 生命周期 |
| `features/admin/rbac/copy.ts`、`viewer-access-card.tsx`、`platform-roles-section.tsx` | 身份卡如实说明「有权调整，但入口暂未接入」「角色变更记录暂未接入」；审计未接入时区块显示说明而不是消失 |
| `components/layout/shell-viewer*.ts`、`shell-header.tsx`、`mobile-navigation.tsx`、`features/home/data.ts`、`app/account/page.tsx` | `ShellViewer.role` 改为服务端计算的 `canAccessAdmin`；账户页角色名使用统一文案（平台所有者 / 平台管理员 / 普通用户） |
| `tests/rbac-chain/platform-rbac-action-chain.test.ts`、`scripts/test-rbac-action-chain-disposable.mjs`、`security-acceptance.yml` | 真实会话请求链路测试及 CI 阶段（第 5 节） |

## 4. 给 Codex 的接口需求（写入链路恢复的前提）

**R1 角色版本（阻塞）。** 为 `profiles` 增加由数据库维护的单调版本（建议 `role_version integer NOT NULL DEFAULT 0`），每次平台角色变化在同一事务内加一，包括运维 Runbook 的首次绑定 SQL。不要使用 `updated_at`：它由 Prisma 客户端按毫秒写入，昵称等字段变化也会改变它，直接 SQL 修改不保证更新。目录读取按字符串返回该值；`updateAdminRoleAction` 接收 `expectedVersion`，在现有行锁和 Serializable 事务内与 `expectedRole` 一并校验，不符时返回冲突，不写入、不记审计。

**R2 确认后的结果（阻塞）。** 成功返回 `{ ok: true, changed: boolean, member: { id, platformRole, roleVersion } }`，其中角色与版本在同一事务内写入后读取。已提交请求的重放返回当前真实状态与 `changed: false`；若此后又被他人修改，前端会按不一致处理并提示刷新。不要返回不含成员状态的成功。

**R3 错误语义（阻塞）。** 每个失败码都必须保证本次请求没有写入：

| 后端情形 | 建议返回 |
| --- | --- |
| 参数无效、OWNER 作为目标或期望角色 | `INVALID_REQUEST` |
| 执行者不是 OWNER | `FORBIDDEN` |
| 修改自己、目标是 OWNER | `TARGET_PROTECTED`（可附原因 `SELF` / `OWNER_PROTECTED`） |
| 目标不存在 | `TARGET_NOT_FOUND` |
| `expectedRole` / `expectedVersion` 不符，或 `requestId` 已用于不同内容 | `ROLE_CONFLICT`，附 `currentRole`、`currentVersion` |
| 已确认回滚的瞬时失败（P2034 / 40001、锁超时、提交前连接失败） | `UNAVAILABLE`（前端允许以同一 `requestId` 重试） |
| 其他未知异常 | 不得返回冲突或任何「未写入」码；重新抛出（前端记为 `UNKNOWN_OUTCOME`）或使用单独的未知结果码 |

可选：未登录和权限变化时返回 `UNAUTHENTICATED` / `FORBIDDEN` 而不是跳转，以便原地说明；当前跳转行为安全，不阻塞。

**R4 审计读取（非阻塞）。** 在 `platformCapabilities` 增加读取能力（建议仅 OWNER），提供 `server-only` 读取函数，内部重新执行 `requireAdmin()` 和能力校验，按时间倒序分页返回：`id`、`createdAt`、执行人与对象的 `id / displayName / email`、`oldRole`、`newRole`。需要说明或补齐：执行时的执行人角色（当前表未存储）；首次绑定记录须有显式来源标记（例如 `source = 'BOOTSTRAP'`），不能靠 `actor_id = target_id` 推断；当前只记录生效变更，前端将全部显示为「已生效」，被拒绝的尝试不在审计内。

**R5 显式可调整角色（非阻塞）。** 在目录读取中直接返回 `assignableRoles` 和 `PEER_ADMIN` 区分码，可替换适配器中的推导。

R1–R3 交付后，Claude 侧的第二阶段 B：适配 Action 结果、在 `/admin` 传入提交器、更新 `admin-contract.test.ts` 中「写入链路不可达」的断言、在请求链路测试中补充版本冲突与结果确认用例，然后重跑完整 CI。

## 5. 验证

- 本地：Typecheck、Lint、单元测试、Next.js 生产构建，结果见 PR 描述。新增与更新：适配器映射（以后端真实判定函数构造输入）、OWNER / ADMIN 目录渲染、`requestId` 生命周期、无版本不可调整、`/admin` 源码约束（无 `RoleControl`、无提交器、无组件导入角色 Action）、Shell 入口改用服务端能力。
- 隔离 Supabase（CI，GitHub 托管 Runner 上的 loopback 一次性实例）：新增 `Verify platform role request chain and OWNER isolation` 阶段，位于 #52 的并发与重放阶段之后：
  1. 重置数据库，运行 `verify-platform-owner-privacy.mjs`：按 Runbook SQL 首次绑定 OWNER、拒绝重复绑定，并以真实 OWNER JWT 验证无法读取他人的项目、草稿、对话、资产记录和私有 Storage。
  2. 再次重置，运行 `tests/rbac-chain/platform-rbac-action-chain.test.ts`：真实 Supabase 登录得到的 Cookie、真实会话校验与 `requireAdmin()`、直接构造的 `FormData` 调用 Server Action、真实事务与审计。覆盖 OWNER 授予与撤销、审计内容、重复请求只生效一次、`requestId` 复用于不同内容、过期期望角色、两个并发请求只提交一个、ADMIN 越权（授予、撤销同级、针对 OWNER、修改自己、自升为 OWNER）、OWNER 自改与 OWNER 作为请求角色、USER / 未登录 / 伪造会话被跳转、被撤销的 ADMIN 下一次请求即失去权限、`/admin` 目录加载器的三种身份结果，以及审计总数与执行人。任一跳过即判失败。
- 本地未运行任何浏览器；Docker 不可用，隔离数据库验证全部在 CI 中进行。

## 6. 未覆盖的风险

- **Server Action 的 HTTP 传输层：** 链路测试直接调用 Action 函数，未经过 Next.js 的 Action 路由与 Origin 校验。写入链路暂停期间该 Action 未注册为端点；第二阶段 B 接入后需补 HTTP 层验证。
- **资产 HTTP 路由：** `app/api/tools/assets/[assetId]/route.ts` 按代码审查以登录用户 `userId` 过滤，无角色分支；OWNER 身份下的 HTTP 端到端访问仍未测试。数据库与 Storage 层的 OWNER 隔离由上述 CI 阶段验证。
- **BYOK：** 尚未实现（仅设计与演示页面），没有可测试的隔离面；上线时需单独验证 OWNER 不能读取他人凭据。
- **OWNER 转移 / 撤权竞态：** 没有转移流程，无法测试；当前只有离线恢复 Runbook。
- **浏览器与视觉：** 远程三端 E2E 只覆盖既有用例（含 USER 访问 `/admin` 被拒）；没有 OWNER / ADMIN 的浏览器用例，也没有视觉验收。
- **暂停期间的功能差异：** 相对现有 `main`，合并本分支后任何人都不能在界面中调整角色（现有 `main` 允许 ADMIN 调整）。紧急撤销 ADMIN 只能通过受控数据库操作。

## 7. 生产 OWNER 初始化前置条件

1. 包含两个 RBAC 迁移的代码已合并并部署，`prisma migrate deploy` 成功且迁移校验和一致。
2. Owner 单独批准初始化；经独立可信渠道核对目标 Auth UUID 与已验证邮箱，确认账号未封禁、未删除且受 Owner 控制。
3. 完成数据库备份并验证可恢复；安排维护窗口，暂停应用写入与 Auth 管理操作。
4. 由数据库高权限运维人员执行 `docs/platform-rbac-operations.md` 的 SQL，替换为批准的 UUID；在独立运维审计中记录审批、执行人与操作 ID。
5. 验证只存在一个 OWNER、审计记录匹配、Auth 身份状态正常；用真实隔离账号核对 OWNER / ADMIN / USER 的 `/admin` 与入口表现后恢复写入。
6. 若需在界面中调整角色，须先完成第二阶段 B；否则 OWNER 初始化后也只能查看。

## 8. 合并方案

推荐一次性合并，避免出现中间失效状态：

1. 保持 #52、#53 为 Draft，不单独合并或部署（#52 单独 Typecheck 失败；#53 单独只有未挂载组件）。
2. Codex 在 #52 分支（或基于本分支）交付 R1–R3；本分支合并其新提交后完成第二阶段 B。
3. 组合 HEAD 重新通过完整 CI（Merge Gates、Supabase Security Acceptance、三端 Authenticated E2E）后，由 Owner 以合并提交方式合并本 PR，使 #52、#53 的提交进入 `main` 历史；若规则要求 Squash，则手动关闭 #52、#53 并注明由本 PR 取代。
4. 部署后按第 7 节执行 OWNER 初始化。

备选：若需提前上线 OWNER 兼容，可在 CI 通过后先合并本分支（角色管理只读），代价是第 6 节最后一条的功能差异持续到第二阶段 B。
