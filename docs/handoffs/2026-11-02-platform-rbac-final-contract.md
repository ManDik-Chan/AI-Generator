# P1-RBAC 最终后端契约交接

本分支依赖 #54 的 `5024bc58d455734883a73b5492a057e8f739131d`；不要单独合并 #52 或 #53。管理页面仍未接入写入，Claude 完成最终集成后再启用。

`updateAdminRoleAction(request)` 接收 `{ profileId, expectedRole, expectedVersion, nextRole, requestId }`。ID 为 UUID；角色仅接受 `USER`、`ADMIN`；版本是目录返回的非负十进制字符串。同一意图重试必须复用完整请求和 requestId，新意图使用新 requestId。OWNER 和 ADMIN 可读取管理目录，只有 OWNER 能修改其他 USER/ADMIN；事务内重新锁定并校验执行者与目标。未登录或不再是管理员仍沿用现有重定向。

成功返回 `{ ok: true, changed, member: { id, platformRole, roleVersion } }`，成员状态来自事务内的数据库结果。无变化的成功也保留请求回执；准确重放且目标仍处于该次结果版本时返回当前状态、`changed: false`。如果目标此后发生过任何角色变化，即使最终又回到同一角色，旧请求也返回 `ROLE_CONFLICT`，避免将历史结果当成本次确认。请求 ID 已用于不同意图也返回冲突。迁移前的审计没有版本信息，其 ID 被保留，但不能证明为准确重放，故返回冲突。迁移后由旧代码或 OWNER 初始化写入的无回执审计 ID 同样不能重用。

明确失败格式为 `{ ok: false, code, ... }`，表示本次调用没有写入：

- `INVALID_REQUEST`：参数、版本或角色无效，OWNER 不可作为请求角色。
- `FORBIDDEN`：事务内执行者不是 OWNER。
- `TARGET_PROTECTED`：自身或 OWNER；`reason` 分别为 `SELF` 或 `OWNER_PROTECTED`。
- `TARGET_NOT_FOUND`：目标不存在。
- `ROLE_CONFLICT`：期望角色或版本不符，或请求 ID 不可用于本意图；附 `currentRole` 和 `currentVersion`，均来自事务内锁定的目标行。
- `UNAVAILABLE`：确认未提交的序列化/唯一键失败，或提交前已识别的连接、锁等待失败。可用相同的完整请求重试；并发竞争可能先返回此码，重试后才能读取赢家回执或确认冲突。

其他异常抛出不含内部细节的错误；特别是提交后响应或确认丢失时，前端必须保持 `UNKNOWN_OUTCOME`，刷新核对，不得当作冲突或确定回滚。框架重定向保持透传。成功后若缓存刷新失败也属于未知结果。

`profiles.role_version` 由数据库触发器维护：初始为 0，每次角色实际变化加 1，普通资料更新和直接指定版本不会更改它。OWNER 首次绑定由同一触发器增加版本，Runbook 在同一事务内验证。角色更新、审计和请求回执一起提交或回滚；无变化成功只写请求回执，不产生角色审计。回执表启用 RLS 并撤销普通客户端权限。

Claude 的接入点：将 action 作为 `onChangeRole` 传给现有目录，保留现有未知结果与刷新流程，使用服务端返回的版本，不要从时间戳推导。#54 的 adapter 现在从数据库提供版本；审计读取、可调整角色后端显式字段及 OWNER 转移仍不在本次范围内。版本迁移和应用发布必须协调；没有实现新旧写入代码并行运行的完整兼容协议。

隔离验证使用独立 loopback Supabase：干净安装与重复部署、历史升级、29 个迁移校验和、16 个事务迁移的逐项故障注入回滚均通过；历史 ADMIN 和旧审计得到保留。完整真实数据库 / JWT / PostgREST 集成套件 15 组、187 项通过且无跳过。真实会话链路还覆盖并发、ABA、回执重放、提交确认丢失和审计注入失败；本地不运行浏览器，最终 UI 接入和浏览器验收仍交由 Claude 在 #54 完成。

另外在临时副本的测试路由上通过真实 HTTP 验证 Next.js Cookie、Supabase 登录、OWNER 写入、ADMIN 拒绝、重放、冲突及未登录重定向；该路由没有进入交付分支，不能替代最终页面的 Server Action 传输验证。Supabase 安全顾问仅报告既有 `public.memory_keywords_valid` 的可变 `search_path` 警告（定义于 `20260713110000_add_memory_governance`），不涉及本次新增函数；该既有问题不在 R1–R3 范围。
