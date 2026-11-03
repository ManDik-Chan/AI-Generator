# P1-RBAC-A 后台角色接口交接

> 此文记录第一阶段接口；角色写入的现行契约及错误语义见 [最终后端契约](2026-11-02-platform-rbac-final-contract.md)。

平台 `Role` 是 `OWNER`（平台所有者）、`ADMIN`（管理员）、`USER`（普通用户）；与 Registry 的项目角色无关。不要依据 UI 状态推断项目访问权或私人数据读取权限。

`features/admin/role-contract.ts` 导出 `PlatformRole`、中文标签、`platformCapabilities(role)` 和 `canChangePlatformRole(actor, target, self)`。前者的 `canAccessAdmin` 对 OWNER/ADMIN 为真，`canManageAdminRoles` 仅 OWNER 为真。后者对其他 USER/ADMIN 仅 OWNER 返回 allowed；对 OWNER 和自己均拒绝。它用于展示提示，不能替代服务端鉴权。此轮没有新增封禁、停用或删除操作。

`updateAdminRoleAction` 保留原 `FormData` 输入：`profileId` 为 UUID，`role` 为 `ADMIN` 或 `USER`，`expectedRole` 是页面读到的目标角色（`ADMIN` 或 `USER`），`requestId` 是每次新意图生成并在重试时保留的 UUID；不接收 OWNER。缺失任意字段时返回 `INVALID_REQUEST`。当前旧控件未提供新增字段，因此暂不能操作角色，直到 Claude 接入。返回 `status`、中文 `message`，失败时可提供 `code`：`INVALID_REQUEST`、`FORBIDDEN`、`SELF_CHANGE`、`OWNER_PROTECTED`、`NOT_FOUND`、`CONFLICT`。未登录者重定向 `/login`，非管理员重定向 `/workspace`；操作期间角色发生变化时事务内再判定，失败不提交。相同角色是安全的无更改成功，重放不会新增审计。

真实变更在同一事务中记录 `actorId`、`targetId`、`oldRole`、`newRole`、`createdAt` 和 `requestId`。`RoleAuditView` 定义最小展示类型；本轮不提供审计读取界面。`requestId` 是客户端生成且重试复用的幂等键，已提交请求重放不会再次修改；若目标角色不再匹配 `expectedRole` 或请求编号用于不同内容，返回 `CONFLICT`。错误 `CONFLICT` 表示数据库冲突或写入失败，请刷新后重试。

前端控件应使用服务器返回的能力及目标可操作性显示与禁用；所有提交都必须经 action，不能以控件隐藏作为安全边界。没有 OWNER 时所有角色变更安全失败；初始化及身份转移必须遵循独立运维流程。

## 与现有页面的集成

当前 `RoleControl` 属性只接受 `ADMIN | USER`，迁移后列表中的 `OWNER` 必须明确显示“平台所有者”且不可提交，不能映射成 ADMIN 或 USER；否则会错误表达角色和可操作性。列表应由服务器按当前 actor 和每个目标计算能力及拒绝原因。OWNER 不应有任何普通角色变更选项。OWNER 自己的行以及 ADMIN 的所有角色变更控件应禁用或不渲染；使用契约的 reason 显示说明。该工作交由 Claude 完成，后端的动作鉴权仍然独立生效。

## 实库验证及剩余缺口

独立 loopback Supabase 中，最终迁移通过 clean、历史增量升级、逐迁移故障注入回滚和 checksum 验证。真实数据库测试覆盖两个连接并发角色写入、冲突、已提交请求重放、ADMIN 拒绝、审计及 OWNER 保护；当前规则中 ADMIN 本来就没有角色写权限，因此这不是 OWNER 转移或撤权竞态的证明。真实 JWT 还验证了 OWNER 对其他用户项目、对话及资产记录的隔离。严格集成套件曾在增加迁移显式事务边界前通过 15 套 / 186 项；最终迁移下对应 RBAC 数据库测试单独通过。

仍需 Claude 接入后验证实际表单、直接构造 Server Action 与 API 请求的完整链路、OWNER 安全转移流程的竞态，以及资产 HTTP 授权路由在 OWNER 身份下的端到端行为。本地浏览器按现有暂停要求未运行；远程 CI 与最终 head 的结果须单独核对。
