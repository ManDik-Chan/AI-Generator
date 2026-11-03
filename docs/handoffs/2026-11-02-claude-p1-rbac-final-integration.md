# 交接：P1-RBAC 最终前后端集成（Claude，2026-11-02）

> 分支 `claude/p1-rbac-integration-20261102`（PR #54）。以普通合并提交 `e8eaba1` 接入 PR #55 `f698575ee6f6fa77f10662239c39d5cd567d3f4d`（合并树与 #55 头部逐字节一致），既有提交均未改写。后端契约以 [最终后端契约](2026-11-02-platform-rbac-final-contract.md) 为准；本文只记录前端接线及验证。第二阶段的字段对照和 R1–R5 背景见 [第二阶段交接](2026-11-02-claude-p1-rbac-phase2-integration.md)。

## 1. 接线

- `app/admin/page.tsx` 导入 `updateAdminRoleAction`，仅在服务端判定 `viewer.capabilities.manageRoles`（即 OWNER）时作为 `onChangeRole` 传给 `PlatformRolesSection`。这只决定是否显示入口；安全边界仍是 Action 在事务内对执行者和目标的重新校验。ADMIN 与 USER 页面不会收到提交器。
- `roleVersion` 来自数据库触发器维护的 `profiles.role_version`（#55 已移除适配器中的 `null`）。打开对话框时以目录中的版本为基线，请求原样发送 `expectedVersion`，客户端不推导、不修改版本。
- 请求体严格为 `{ profileId, expectedRole, expectedVersion, nextRole, requestId }`。`requestId` 沿用已有状态机：同一意图重试复用，选择或基线变化即更换。
- 成功结果按最终契约解析：`{ ok: true, changed, member: { id, platformRole, roleVersion } }`。以下情况不信任为成功，记为 `CONTRACT_MISMATCH` 并要求刷新：缺少 `changed`、成员或角色与请求不符、返回版本仍等于请求基线版本（界面只发起实际变更）。
- 成功后行内立即显示服务端确认的角色并锁定；Action 的 `revalidatePath("/admin")` 返回新快照后，版本前进即解锁（「已授予平台管理员。」等）。

## 2. 结果与界面状态

| 服务端结果 | 界面 |
| --- | --- |
| 成功（含重放 `changed: false`） | 显示确认后的角色，待新快照同步后解锁 |
| `ROLE_CONFLICT` | 「角色已被他人修改」，附服务端当前角色；锁定，刷新后对话框按新基线重建并清除旧选择 |
| `FORBIDDEN` | 「你的权限已变化」；锁定至刷新 |
| `TARGET_PROTECTED` | 「这位用户受保护」；锁定至刷新（`reason` 不进入视图模型） |
| `TARGET_NOT_FOUND` / `INVALID_REQUEST` | 对应说明；锁定至刷新 |
| `UNAVAILABLE` | 「暂时无法保存」；可用同一完整请求重试 |
| 抛出（含提交后响应丢失、缓存刷新失败） | `UNKNOWN_OUTCOME`：「无法确认结果」，不判成功或失败，禁止重复提交，刷新后显示实际角色 |
| 框架跳转（未登录、已非管理员） | 透传 Next.js 跳转 |

## 3. 验证

**单元测试（本地）**：`features/admin` 全部通过，新增或更新：

- `rbac/contract.test.ts`：#55 的实际成功、重放、冲突（含 `currentVersion`）、`TARGET_PROTECTED`（含 `reason`）载荷；缺少 `changed` 或版本未前进的成功不被信任。
- `rbac/server-directory.test.ts`：按页面规则接线后，OWNER 只在后端允许的三名成员上有入口、自身无入口；ADMIN 无入口；未传提交器时仍为只读。
- `admin-contract.test.ts`：原「写入链路不可达」断言改为「仅 `app/admin/page.tsx` 导入 Action，且只交给有管理权的查看者」。

**浏览器 E2E（仅远程 CI，三端各一次）**：`tests/e2e/mobile/admin-platform-roles.spec.ts`，在生产构建与一次性 Supabase 上运行，每一步都以数据库核对：

1. OWNER 打开 `/admin`：系统状态、运行与用量、操作入口、最近运行等原有区块正常；自身行为「不能修改自己的角色」；审计区显示未接入。
2. OWNER 经界面授予 ADMIN：抓取真实 Server Action 请求，核对请求体携带数据库版本 `"0"`；行内同步为「已授予平台管理员。」；数据库角色为 ADMIN、版本 1、一条审计。
3. ADMIN 页面无任何调整入口；以 ADMIN 会话直接调用同一 Action（授予用户、撤销同级、针对 OWNER）均返回 `FORBIDDEN`，无写入、无回执。
4. 打开对话框后由他人改变目标角色，再提交：`ROLE_CONFLICT`，无写入；刷新后对话框按新角色重建。
5. 提交后在浏览器侧丢弃响应（服务端已提交）：界面显示「无法确认结果」且不可再次确认；数据库已变更一次；刷新后显示实际角色。
6. 以完全相同的请求重放：`{ ok: true, changed: false }`，审计仍为一条；同一 `requestId` 用于另一意图：`ROLE_CONFLICT`。
7. OWNER 撤销 ADMIN 后，该账号打开 `/admin` 被转到工作台，再调用 Action 得到 303 跳转；未登录请求被中间件 307 转到登录页；均无写入。
8. 全部生效变更共三条审计，执行人均为 OWNER。
9. OWNER 打开其他成员的私人对话地址得到 404 页面，页面与 `/admin` 均不含该对话内容。

该用例需要创建 OWNER，而数据库只允许一个且禁止删除，因此只在 CI 一次性实例上运行（`CI`、`ALLOW_TEST_DATABASE_MUTATIONS`、`TEST_DATABASE_CONFIRMED_NON_PRODUCTION` 与 loopback Supabase 同时满足，否则跳过），OWNER 随实例销毁。本地未运行任何浏览器（AGENTS.md）。

## 4. 仍未验证

- **视觉验收**：E2E 只做功能断言，没有截图或视觉评审。
- **资产 HTTP 路由**：OWNER 身份下 `app/api/tools/assets/[assetId]` 的端到端访问仍只有代码审查；数据库与 Storage 层隔离由 `verify-platform-owner-privacy.mjs` 覆盖。
- **审计读取（R4）与显式可调整角色（R5）**：未实现，非本轮范围；审计区如实显示未接入。
- **OWNER 转移、BYOK 凭据隔离**：没有对应功能。
- **新旧写入代码并行**：版本迁移与应用发布需协调，后端未提供新旧代码同时运行的兼容协议。
- **生产环境**：未连接生产 Supabase，未部署，未初始化真实 OWNER。

## 5. 部署与 OWNER 初始化注意事项

- 迁移 `20261102095909_platform_role_version_receipts` 与应用版本需在同一维护窗口发布；旧应用代码不写回执，迁移后不得与新代码并行写入角色。
- 相对现有 `main`，部署后 ADMIN 不再能在界面调整任何平台角色；在 OWNER 初始化完成前，界面中没有人能调整角色，紧急撤销只能走受控数据库操作。
- OWNER 初始化按 `docs/platform-rbac-operations.md` 执行，并核对角色版本已前进；所有生产迁移与真实 OWNER 绑定须单独获得 Owner 批准。
- 初始化后用真实隔离账号核对 OWNER / ADMIN / USER 的 `/admin` 表现，再恢复应用写入。

## 6. 目录同步改为由 Action 结果送达（2026-11-03）

**现象。** 远程 E2E 在三端间歇失败：角色变更或「刷新最新状态」之后，服务端已返回正确且完整的 `/admin` 数据，界面却一直停在「正在同步最新权限…」或未重新对齐的对话框。

**CI 诊断结论（仅失败时记录，见 E2E 中的 `collectStallDiagnostics`）：**
- Next.js 路由 Action 队列为空，没有丢弃或积压的动作；路由状态的每个待提交更新都已拿到完成的数据。
- 路由缓存树完整：根、`admin`、`__PAGE__` 段的 RSC 都已存在，没有懒加载请求或整页跳转。
- 样式资源均已加载（React 记录为已插入且已加载）。
- React 根节点上有一个 transition lane 处于挂起状态，未被 ping，也没有已排程的回调；`pingCache` 中没有任何仍在等待的 Promise。再触发一次刷新有时能提交，有时不能。

即页面级重新渲染被 React（19.1.10）挂起且没有唤醒；Action 结果和本地状态更新始终正常。根因位于框架内部，尚未定位到具体缺陷，本轮不升级 React 或 Next.js。

**处理。** 目录不再只依赖整页重新渲染获得最新快照：
- 新增 `features/admin/rbac/directory-action.ts` 的 `loadPlatformDirectoryAction`，与页面使用同一入口：`getAdminOverview()` 内的 `requireAdmin()` 和 `toPlatformDirectory()` 解析，仅交给能调整角色的查看者。
- 每个快照带服务端生成时间 `generatedAt`；目录只接受更新的快照，较晚提交的旧页面渲染不会覆盖。
- 确认成功后与点击「刷新最新状态」时调用该 Action；失败后仍保持锁定，直到用户主动刷新。`router.refresh()` 仍会执行，页面其他区块在 React 提交后更新。
- 真实会话链路测试新增该 Action 的 OWNER / ADMIN / USER / 未登录用例。

页面概览等其他区块仍依赖整页渲染，同样可能延迟更新。E2E 中的诊断代码在确认稳定后再移除。
