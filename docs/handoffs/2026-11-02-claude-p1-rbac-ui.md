# 交接：P1-RBAC-UI 平台角色管理前端（第一阶段，Claude，2026-11-02）

> 分支 `claude/p1-rbac-ui-20261102`，基于 `main` `455765c`。本阶段只新增独立的展示组件、交互状态、契约适配与测试，**没有挂载到线上 `/admin` 页面**，也没有修改 `app/admin/page.tsx`、`features/admin/actions.ts`、`features/admin/data.ts`、`role-control.tsx`、`lib/auth/**`、`prisma/**`、`supabase/**`、Shell 导航或任何服务端鉴权。Codex 的 RBAC 后端分支在本阶段开始时尚未发布（远端无相关分支或 PR）。

## 1. 交付内容

| 文件 | 作用 |
| --- | --- |
| `features/admin/rbac/contract.ts` | 前端消费的视图模型（zod）：`PlatformViewer`、`PlatformMember`、`PlatformDirectory`、`RoleChangeRequest`、角色变更结果、审计 Feed；`parsePlatformDirectory`、`parseRoleAuditFeed`、`interpretRoleChangeResult`、`performRoleChange` |
| `features/admin/rbac/copy.ts` | 角色名称、限制原因、错误码文案、变更风险描述、固定时区的日期格式 |
| `features/admin/rbac/role-change-state.ts` | 目录级状态机：单一对话框、行级结果提示、过期数据锁定与重新对齐 |
| `features/admin/components/platform-role-badge.tsx` | 平台角色徽标（平台所有者 / 平台管理员 / 普通用户） |
| `features/admin/components/viewer-access-card.tsx` | 当前登录者的平台身份、角色含义、本次可执行能力、平台与项目角色的区分说明 |
| `features/admin/components/member-directory-view.tsx` | 用户列表（筛选、行操作、限制原因、行级结果与恢复操作），无状态 |
| `features/admin/components/role-change-dialog-view.tsx` | 角色调整对话框（选择、风险提示、保存中、失败、冲突、过期），无状态 |
| `features/admin/components/platform-member-directory.tsx` | 客户端容器：调用服务端 Action、`router.refresh()`、焦点管理、防重复提交 |
| `features/admin/components/role-audit-log.tsx` | 角色变更记录（执行人、对象、前后角色、时间、结果）；未接入时明确说明，不显示示例 |
| `features/admin/components/platform-roles-section.tsx` | 第二阶段挂载到 `/admin` 的组合区块；USER 视角时失败即关闭 |
| `tests/fixtures/admin-rbac.ts` | 仅供测试的手写数据，文件头已标注；应用代码不导入 |
| 3 个测试文件 | 见第 6 节 |

## 2. 原则

- **授权事实全部来自服务端。** 是否能管理角色、某位用户可以被调整为哪些角色、为什么不能调整，都由服务端按当前登录者给出（`capabilities`、`assignableRoles`、`restriction`）。界面不根据角色名推算任何权限，只会比服务端显示得更少（失败即关闭），不会更多。
- **结果以服务端返回为准。** 成功结果必须指明被请求的用户和目标角色，否则视为 `CONTRACT_MISMATCH`，界面不推测是否生效，只提示刷新。请求抛错记为 `UNKNOWN_OUTCOME`，同样提示刷新且不建议重复提交。现有 Action 的 `{ status, message }` 形状也会被判定为不可识别，避免第二阶段误把旧接口当成新契约。
- **不显示过期的可操作状态。** 成功后该行显示服务端确认的新角色并锁定操作，直到新的服务端快照中该用户的 `roleVersion` 变化；冲突、权限变化、会话过期、结果未知等失败也会锁定该行直到下一次服务端快照。对话框打开期间如果该用户被他人修改，已选的目标角色会被清除并提示重新确认。
- **平台角色与项目角色分离。** 视图模型没有任何项目角色字段；解析时多余字段（如 `projectRoles`）会被丢弃。界面文案统一使用「平台所有者 / 平台管理员」，并说明「项目所有者」只在项目内有效。
- **不展示敏感数据。** 审计条目只有执行人与对象的 ID、昵称、邮箱，以及前后角色、时间、结果；解析会丢弃契约外字段（IP、Token、密码、对话内容等），测试覆盖。

## 3. OWNER / ADMIN / USER 在界面上的差异（由服务端数据驱动）

| | OWNER | ADMIN | USER |
| --- | --- | --- | --- |
| 身份卡 | 实心「平台所有者」徽标；可调整角色、可看审计 | 「平台管理员」；不能调整平台角色，说明任免管理员和调整其他管理员由所有者负责 | 不进入 `/admin`；组件若收到 USER 视角，只显示「没有平台管理权限」，不渲染列表、操作或审计 |
| 行操作 | 服务端给出 `assignableRoles` 的行显示「更改角色」 | 默认没有任何「更改角色」；若服务端将来为 ADMIN 提供某些调整，界面照样跟随 | — |
| 不可操作的提示 | 自己的行：「所有者角色受保护」 | 其他管理员：「仅平台所有者可调整」；自己：「不能修改自己的角色」；所有者：「所有者角色受保护」。普通用户行不逐行重复「无权调整」，由身份卡统一说明 | — |
| 审计 | `viewRoleAudit` 为真时显示「角色变更记录」 | 无该能力时整个区块不渲染 | — |

调整流程：「更改角色」→ 对话框（对象、当前角色、服务端允许的目标角色、每个选项的后果）→ 风险提示（扩大权限为警告色，收回权限为信息色，并说明服务端会再次校验）→ 具体的确认文案（「确认授予管理员」「确认撤销管理员」）→ 保存中（选项禁用、`aria-busy`、读屏播报）→ 成功关闭对话框并在行内播报，失败在对话框内以 `role="alert"` 说明并给出恢复操作。

| 结果 | 界面 |
| --- | --- |
| 成功 | 行内「已授予平台管理员，正在同步最新权限…」，徽标显示新角色，操作锁定至新快照 |
| `ROLE_CONFLICT` | 「角色已被他人修改」，带服务端当前角色；锁定，提供「刷新最新状态」 |
| `FORBIDDEN` | 「你的权限已变化」；锁定，提供刷新 |
| `UNAUTHENTICATED` | 「登录已过期」；提供「重新登录」（`/login?next=%2Fadmin`） |
| `TARGET_PROTECTED` / `TARGET_NOT_FOUND` / `INVALID_REQUEST` | 对应说明；锁定，提供刷新 |
| `RATE_LIMITED` / `UNAVAILABLE` | 说明没有更改任何权限；对话框保持可用，可再次确认 |
| `CONTRACT_MISMATCH` / `UNKNOWN_OUTCOME` | 「无法确认结果」，不声称已生效或未生效；锁定，提供刷新 |

## 4. 需要 Codex 提供的契约（第二阶段对接依据）

字段名可以不同，第二阶段会在一个适配函数中映射到 `contract.ts`；但**语义**需要具备：

1. **当前登录者**：`id`、平台角色（`OWNER | ADMIN | USER`）、`manageRoles`（能否调整至少一部分用户的角色）、`viewRoleAudit`（能否读取审计）。
2. **用户列表（按当前登录者计算）**：每位用户的 `id`、`email`、`displayName`、平台角色、`createdAt`，以及
   - `roleVersion`：每次角色变化都会改变的不透明值（`updatedAt` 或递增计数均可，但必须随角色变化而变化）；
   - `assignableRoles`：此刻服务端会接受的目标角色（不含当前角色）；
   - `restriction`：不提供调整时的原因，建议枚举 `SELF`、`OWNER_PROTECTED`、`PEER_ADMIN`、`INSUFFICIENT_ROLE`；
   - 可选：现有的对话 / 人格 / 记忆 / 运行计数；
   - 总用户数（列表仍可只取最近 50 名）。
3. **角色变更 Server Action**：入参 `profileId`、`expectedRole`、`expectedVersion`、`nextRole`；返回
   - 成功：`{ ok: true, member: { id, platformRole, roleVersion } }`，并 `revalidatePath("/admin")`；
   - 失败：`{ ok: false, code, currentRole?, retryAfterSeconds? }`，`code` 建议为 `UNAUTHENTICATED`、`FORBIDDEN`、`TARGET_PROTECTED`、`ROLE_CONFLICT`、`TARGET_NOT_FOUND`、`INVALID_REQUEST`、`RATE_LIMITED`、`UNAVAILABLE`，且每个失败码都保证**没有更改任何数据**；
   - 会话过期或权限不足时**返回错误码而不是 `redirect()`**，这样界面可以原地说明；
   - 目标当前角色或版本与 `expected*` 不符时返回 `ROLE_CONFLICT` 和 `currentRole`，不要静默覆盖，也不要在“目标已是该角色”时返回成功。
4. **审计 Feed（如交付）**：每条记录 `id`、时间、执行人（`id`、昵称、邮箱、执行时的平台角色；系统初始化可为空）、对象（`id`、昵称、邮箱）、前后角色、`APPLIED | REJECTED`、拒绝原因码。未交付时第二阶段传入 `{ status: "unavailable" }`，界面明确显示“暂未接入”，不使用示例数据。
5. **Shell 入口能力**：导航目前用 `viewer?.role === "ADMIN"` 决定是否显示「系统管理」入口（`components/layout/shell-header.tsx`、`mobile-navigation.tsx`、`command-palette` 调用处，`app/account/page.tsx`），`ShellViewer.role` 类型只有 `USER | ADMIN`。枚举加入 OWNER 后，若不改动，OWNER 会看不到入口、账户页显示为「个人用户」。建议服务端在 `getShellViewer()` 中提供一个由后端计算的「可进入平台管理」布尔值；前端第二阶段改为只读该值，不在前端用角色名判断。若 Codex 的迁移 PR 需要先让类型通过，请在交接中注明改动位置，避免两边同时编辑这些文件。

## 5. 现有 `/admin` 与 RoleControl 审查结论（代码审查，未经浏览器验证）

| # | 发现 | 归属 |
| --- | --- | --- |
| A1 | 角色标签 `item.role === "ADMIN" ? "管理员" : "普通用户"`：OWNER 上线后会被显示为「普通用户」；概览「N 名管理员」只统计 ADMIN | 第二阶段前端 |
| A2 | `RoleControl` 的下拉只有 USER / ADMIN，`role` 类型也只有两种：OWNER 行会显示为第一个选项「普通用户」，误点保存即尝试降级 OWNER（需服务端拒绝） | 第二阶段前端（由新目录替换）+ 服务端保护 |
| A3 | 每行下拉的可访问名称都是「用户角色」、按钮都是「保存角色」，读屏用户无法分辨是哪位用户 | 新组件已解决 |
| A4 | 结果提示的 `aria-live` 元素按需挂载，首次结果可能不被播报；成功提示一直保留 | 新组件已解决 |
| A5 | 授予或撤销管理员没有确认和风险提示，选择后点保存即生效 | 新组件已解决 |
| A6 | Action 只接收目标角色：他人已修改时会静默覆盖；目标已是该角色时也返回「已授予管理员角色」 | Codex（`expectedRole/expectedVersion`、`ROLE_CONFLICT`） |
| A7 | 失败后下拉保留未保存的选择，而徽标仍是旧角色；会话过期或被降权时 Action 内的 `requireAdmin()` 会跳转而不是原地反馈 | Codex（返回错误码）+ 新组件 |
| A8 | 自降权禁用由页面计算 `item.id === user.id`（服务端也有校验）；新模型改为服务端 `restriction: SELF` | Codex 提供字段 |
| A9 | `requireAdmin()` 判断 `role !== "ADMIN"`：OWNER 上线后会被挡在 `/admin` 外 | Codex |
| A10 | 长邮箱使用 `break-all`，窄屏下网格会堆叠；深色模式使用主题 Token。均为代码阅读结论，未做视觉验收 | — |

## 6. 验证

本地（Windows，Node 22，pnpm 11.7.0），结果见 PR 描述中的提交号：

- 新增测试：`features/admin/rbac/contract.test.ts`（契约解析、字段剥离、项目 OWNER 不获得平台权限、结果判定、重定向透传、审计、文案）、`features/admin/rbac/role-change-state.test.ts`（打开/选择/保存、成功后锁定与同步、冲突、权限变化、可重试失败、结果未知、对话框打开期间数据变化）、`features/admin/components/rbac-render.test.ts`（OWNER/ADMIN/USER 可见性、限制原因、长文本换行、行级反馈、对话框各状态、审计、只用主题 Token、组件不读取项目角色或测试数据）。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 结果记录在 PR 描述中。

**未执行：** 本地浏览器、E2E、截图与视觉验收（AGENTS.md 暂停本地浏览器自动化，本任务未获单独授权）。因此桌面/窄屏布局、深色模式外观、真实焦点移动和读屏播报都只有代码层面的保证，没有经过浏览器验证。

## 7. 第二阶段（取得 Codex 契约或后端 PR 合并后）

1. 在 `features/admin/rbac/` 增加一个适配函数，把 Codex 的数据和 Action 结果映射到 `contract.ts`，在服务端解析后再传给客户端组件。
2. 在 `app/admin/page.tsx` 用 `PlatformRolesSection` 替换现有「用户与角色」区块和 `RoleControl`，传入 Codex 的 Action；概览中的管理员计数改用服务端角色统计。
3. Shell 入口与账户页改用服务端提供的「可进入平台管理」值（见第 4.5 节）。
4. 更新 `features/admin/admin-contract.test.ts` 对 `<RoleControl` 的断言，补充 E2E（OWNER / ADMIN / USER 三种账户），并在获得授权后进行浏览器与视觉验收。
5. 如需在后端 PR 合并前集成，将本分支堆叠在后端分支上，并在 PR 中写明依赖，不把未合并的接口改动带入独立 `main`。
