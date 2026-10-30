# 交接：P1-B1 Registry 与最新 main 集成（2026-10-30）

本次只交付 Registry 数据与权限基础的隔离开发候选。生产迁移、部署、main 合并和 P1-B2 均未授权；main 由 Owner 手动合并。验收结果及对应提交以 [registry-validation.md](../registry-validation.md) 和该提交的 CI 为准，2026-10-28 的通过记录不能代替本轮证据。

## 基线与 PR 处理

- 集成基线：`main@c79b6a78d30b5697a842f9491a2a0667cc3168dd`，已包含 PR #27 的 P1-A、PR #36 的两个 Demo 与开发者文档。
- 复用实现：PR #29 `8ba37c3e5d025ac0185d40b37e6ddf91a589a61f`。读取完整差异后保留原提交历史，与 main 做显式合并；没有从历史分支盲目 cherry-pick。
- 独立开发分支 / worktree：`codex/p1-b1-main-integration-20261030` / `D:/AIGC/p1-b1-main-integration-20261030`。原工作区改动保留。
- 合并预检的唯一文本冲突为 `vercel.json` 的分支部署禁用列表；保留 main 条目并添加 Registry 两个分支。业务源码、现有迁移、Demo 契约没有文本冲突。
- 推荐继续维护 Draft PR #29：集成候选是原 #29 head 的后代，可正常快进更新其远端分支，保留审阅历史，无需 force-push。交付时核实 PR head 和检查对应 SHA；不另开可被重复合并的平行 PR。若无法更新原分支，保留本地候选并明确说明阻塞，不绕过分支保护。

## 数据库迁移与边界

原样保留 Registry 基础迁移 `20261028135224_project_registry_foundation`；main 上已有 21 个迁移构成原顺序前缀。另追加 `20261030120001_registry_sealing_qualification`，全链共 23 个迁移。不得重新生成同义 migration、重命名已应用 migration，或编辑正式应用的历史文件。数据库约束含 SQL 专有 CHECK、partial unique index、trigger 和 ACL，仅 Prisma schema 不能重建；不能使用 `prisma db push` 替代迁移。

补强迁移处理本轮审查发现的自然过期问题：资格到期不会触发 UPDATE trigger，因此不能只依赖 authzEpoch 判断批准是否仍有效。新增 Version/Release 的 BEFORE INSERT 检查，在封存时实时验证 submitter 的 OWNER/EDITOR 和 reviewer 的 REVIEWER 资格；保留原事务与生命周期约束。它不新增发布命令，也不实现 B2 完整协议。

八实体为 Project、ProjectDraft、ProjectVersion、ProjectRelease、ProjectAsset、ProjectDocumentation、ProjectMembership、PublicationReview；`registry_private.internal_operators` 是 SQL 内部资格表，不是新增的产品实体。

| 基础能力 | 交付边界 |
| --- | --- |
| 项目身份 | PRIVATE 默认；owner 从可信 Auth 主体确定；不可改 owner/slug、不可硬删项目，slug 不复用 |
| 归属 | 子实体复合外键含 projectId；currentRelease 同项目且必须 PUBLISHED；复合唯一约束与单活动草稿 |
| 内部资格 | 当前有效的资格 + active membership；不从 Profile.ADMIN、payload owner、JWT user_metadata 或项目角色推导全局权力 |
| 数据访问 | 八表启用 RLS；anon/service_role 无直接表权限；authenticated 仅最小 SELECT，实时资格与成员过滤；无客户端写 GRANT/policy |
| 生命周期 | Version 不可变；Review 绑定 revision/epoch/hash/visibility 等且禁止自审；Release 只可一次撤回；文档与资产绑定同项目批准字节 |
| 内部函数 | `createInternalRegistryProject(accessToken, { slug })`，默认 flag 关闭；验证 Auth、锁当前创建资格，原子建立 Project/OWNER/DRAFT；无 HTTP 入口 |

这些约束是后续命令的基础。Prisma/数据库 owner 仍是可信服务端权限，不能暴露通用 SQL、任意 ORM 写入或把未经动作定权的 actor 字段传入数据库。Hash 的语法与绑定校验不证明 JCS 计算、内容政策或整个发布协议已经实现。

## Demo / Manifest / OpenAPI 兼容报告

审查入口：Claude [交接文档](2026-10-30-claude-developer-platform.md)、`features/platform/source.ts`、`features/platform/run-lifecycle.ts`、`features/demos/runtime/{capability,registry,handlers,executor,openapi}.ts`、`features/platform/manifest.ts`、`docs/developer/*`；并对照历史 `d616364` 的 P0.5 Registry/Publication、Draft/Version/Release 契约。历史契约只作设计参考，没有导入旧实现或旧迁移。

| 现有模块 / 契约 | 与 Registry 的依赖 | 本轮兼容结论 |
| --- | --- | --- |
| 路线优化 `/demos/route-optimizer` | Demo Runtime 的静态 `route-optimizer.solve`；不读 Registry | 继续使用原有有界服务端计算、JSON/SSE、错误与限流协议，无数据库依赖 |
| 神经网络 `/demos/neural-network` | `aig.worker/1` 与浏览器 MLP；不读 Registry | 保留同源 Worker 和主线程降级；不改视觉、交互或执行位置 |
| Run Lifecycle | `PENDING → ACCEPTED → RUNNING → SUCCEEDED/FAILED/CANCELLED/TIMED_OUT` | 同名运行状态不与 ProjectDraft/Review/Release 状态混用；B1 无新 Run 表或持久运行协议 |
| `aig.capability/0.1` | 描述符 `project` 为 slug，能力自身有 version | 保留 Demo 静态登记；不把此版本自动视为 ProjectVersion，不把 `status:demo` 视为发布批准 |
| Manifest `0.5.0` | 项目 ID/slug/semver/visibility；L0 `SHOWCASE` 与三个 `*.read` 能力 | slug、可见性、版本形状与基础模型一致；数据库 JSON 字段不替代完整语义验证；不把计算描述符塞入现有 Manifest |
| OpenAPI 3.1 | 当前只描述 `/api/demo/v1/*`；由运行时 zod 生成 | 不增 Registry HTTP operation，不改现有路径、字段或响应；生成一致性仍由单测校验 |
| Developer Docs | 构建读取 Markdown；例子与机器规范有一致性检查 | 只更新接口状态事实；Manifest Schema 副本保留，直到规范源另行正式合入并可统一引用 |
| Explore / 平台控制台 | `features/platform/source.ts` 返回 `source: "demo"` 的 fixture | B1 不替换数据源、不把数据库原始行输出到公共页面，不把真实 Demo 展示条目当作已发布 Registry 数据 |
| AI Hub / Auth / Storage / P1-A | 既有路由、表、RLS、资产删除/归属安全链 | B1 添加独立模型和 Profile 反向关系；保留旧模型/枚举语义及现有接口，真实回归结果见验收记录 |

当前 Demo API 仍是一次请求内完成的运行，浏览器 Worker 仍是计算隔离；它们没有因为 B1 表结构出现而成为异步 202 服务或第三方安全沙箱。Fixture 的版本状态也不作为 Registry 生产发布证据。

本轮静态对比确认 `app/`、Demo/Docs/Platform 源码、`middleware.ts`、Auth、`prisma/rls.sql`、`public/` 和机器契约相对上述 main 基线无差异。OpenAPI 文件 SHA-256 为 `b54db420849af89516ef25d7d9c3db173cc65532b3df5c6fa19ce352d701179f`；Manifest Schema 副本为 `ce140b0925c2bba0cb59a1b015f125795dc6f5eb30c7230f294b218ec6f7386c`。源码一致性只能证明本轮未修改这些模块，真实回归结果仍须看本提交验收。

后续接线顺序是：有效 Review → 不可变 Version → Release 与批准资产映射 → 严格公开投影 → `source.ts`。运行能力还需独立的审核登记/执行授权与版本绑定后，才能替换 `features/demos/runtime/registry.ts`；不能直接扫描 Draft JSON 注册可执行能力。

## 已完成与待完成接口清单

| 分类 | 接口 / 入口 | 状态 |
| --- | --- | --- |
| 现有 Demo HTTP | `GET /api/demo/v1/capabilities`、`GET /api/demo/v1/capabilities/{capabilityId}`、`POST /api/demo/v1/runs`、`GET /api/demo/v1/openapi.json` | main 已有，本轮保持兼容 |
| 内部库函数 | `createInternalRegistryProject` | 本分支实现、默认关闭、无路由调用；不是 `POST /internal/v1/projects` 已部署 |
| 数据读取基础 | authenticated 的八表受 RLS SELECT | 只供合格内部成员；不是公开 ReleaseDTO；不允许把原始行作为 API 响应 |
| Registry 管理 HTTP | `/internal/v1/projects…` 的 21 个设计命令 | 未实现：DraftDTO、编辑 CAS、提交/撤审、审核封存、发布/撤回/回滚等 |
| Registry 公开 HTTP | 目录、当前发布、指定发布、发布文档的四个 `GET /api/v1/projects…` | 未实现；依赖完整发布与资产授权闭环 |
| 资产服务 | 上传、净化、批准、独立 origin、撤回后的清理 | 只有数据约束；存储协议与服务入口未实现 |
| 持久运行 | 202 提交、状态查询、取消、幂等、持久任务、回调签名 | 未实现；现有 executeRun / 生命周期可复用，但不属于本轮 B1 |
| 第三方能力 / Grant | 审核登记、安装授权、撤销与执行适配 | 未实现、未启用 |
| BYOK / 外部代码 / GPU | 凭据托管、任意代码、GPU 服务 | 本轮禁止实现或启用 |

## 新提交的验收要求

本轮验收结果集中记录在 [registry-validation.md](../registry-validation.md)，应明确候选提交、基线、Node 版本、隔离栈名、迁移校验和、测试计数、失败阶段与 CI 链接。没有运行或基础设施失败的检查必须标为未通过验收，不能借用旧 #29 或 #36 的历史结果。main 的 [active ruleset](https://github.com/ManDik-Chan/AI-Generator/rules/19544327) 要求 strict 的六项检查：lint、typecheck、unit tests、build、authenticated Playwright、Supabase Security Acceptance，无 bypass actor；Node 24 compatibility 作为额外 CI 也保留。

必须覆盖：空库全链、main 旧库升级与旧表数据快照、提交前故障的整体回滚、重复 deploy 与迁移账本、八表 ACL/RLS、真实 Auth JWT/PostgREST、anon/A/B/操作员与 ADMIN/metadata 伪造、跨项目和 owner/FK 伪造、资格过期/撤销、不可变及生命周期约束，以及原 P1-A 安全套件。保留 lint/typecheck/unit/build/Node 24 与原 required CI。单元测试跳过数据库用例不能计作真实安全验收。

本地浏览器按 `AGENTS.md` 保持禁用。必需 CI 的结论以本次提交运行结果为准，不能把配置存在或历史通过写成新提交通过；失败时继续保留 Draft 和默认关闭入口。

## 生产迁移、自动部署与回退计划（仅供 Owner 后续审批）

本轮没有执行下列生产步骤。这是一份待批准的运行顺序，不是执行授权。

1. 本轮只读查询已确认 Vercel 项目 `ai-generator`（`prj_U8Sv0eRG773ojqojMM7mZl3Ysm9V`）的 production deployment `dpl_5xgXmvHCzdtSfVvRGQtpvPAEFjQf` 为 Git source、ref `main`、SHA `c79b6a7`、READY，main 合并确有自动部署。Owner 先复核 build/install override、Git 自动发布及 Deployment Checks，再决定暂停自动发布或采用批准后的分阶段发布。`vercel.json` 对两个 Registry 分支的 `false` 只阻止对应分支自动部署，未列出的 main [默认允许部署](https://vercel.com/docs/project-configuration/git-configuration)。
2. 该 deployment 的完整构建日志显示实际命令为 `pnpm install --frozen-lockfile` → `prisma generate`，以及 `pnpm build` → `prisma generate` → `next build`，未见迁移。仓库 `postinstall` / `prebuild` 与此一致；`db:deploy` 是独立命令。现有 workflow 只由 PR/手动触发，其 `migrate deploy` 使用各 job 生成的 local Supabase 地址，不是生产迁移 job。Dashboard override 未由 MCP 暴露，integration configurations API 返回 403；仓库还存在指向 `share.streamlit.io` 的 active push webhook，其分支部署策略未知。未来合并前须由 Owner 核对这些外部配置，Vercel 分支禁用不能抑制其他服务，现有日志也不能保证未来行为。
3. 核准候选 SHA、完整 CI 与 schema checksum；确认线上 `_prisma_migrations` 的顺序前缀和新迁移是否已存在。只读生产盘点本身也须另行授权，不能在本轮查询。若数据库已有不同校验和，先停下调查，不修历史、不忽略冲突重跑。
4. 在批准的备份/PITR 及恢复演练、变更窗口、执行身份、锁等待/statement timeout 和监控条件下，确认 `REGISTRY_INTERNAL_ACCESS_ENABLED=false`、无对外 Registry 路由、无真实内部资格种子。由 Owner 决定应用代码与数据库的先后；B1 是 additive 且无页面读表依赖，当前应用可继续使用旧数据源。
5. 经生产迁移单独批准后，仅执行账本中未应用的顺序迁移；不 `db push`、不 reset、不加载测试 seed。验收迁移账本、八表约束/RLS/GRANT、private schema 与原 P1-A 表/资产行为。生产验收主体与操作范围须另批。
6. 迁移通过后仍保持 flag 关闭；Owner 再单独批准应用部署及 main 手动合并。不把迁移成功视为发布项目、运行第三方能力或启用 B2 的授权。

两条迁移分别自带事务，提交前失败只回滚该条迁移，不是跨文件的整体事务。若第二条失败，第一条已提交的基础表和权限会保留；保持入口关闭，调查后采用经批准的前向修复，不把部分安装当作通过验收。事务已经提交后的应用回退：禁用入口并回退应用版本，保留新表、ACL、不可变审核/发布历史及 slug 保留。不得通过删表、关闭 RLS、给客户端写权限或改历史 migration 回退。需 schema 修复时新增前向迁移；灾难恢复只能依据另批的备份恢复方案，并处理变更窗口内其他业务数据。

## 风险与 P1-B2 实施顺序

| 风险 / 未完成项 | 后续处理 |
| --- | --- |
| 数据库 owner 可绕过应用权限；B1 不构成完整动作 API | 保持 server-only 和无路由；每个 B2 命令显式校验当前主体、内部动作资格与项目角色 |
| 隔离库 security advisor 仍有一项旧函数 search_path WARN | 来自 main 未改动的 public.memory_keywords_valid（20260713110000，invoker/immutable）；Registry 无该告警，记录为独立历史加固风险，不改旧 migration 或压制告警 |
| Auth logout/会话撤销与内部资格撤销不同 | B1 的 getUser 校验 token，资格/成员状态实时复检；不承诺已签发 token 随 logout 立即失效。若敏感 B2 命令要求即时会话撤销，另实现 session_id 与当前会话状态验证 |
| B1 检查 hash 形状/引用绑定，未验证 canonical bytes 或完整语义 | 先实现严格 DTO 与 JCS 跨语言向量，不能由客户端给出可信 hash |
| 内容批准、资产授权、政策/成员资格会变化 | 命令事务锁与 revision/epoch/CAS；发布前实时复检；读投影 fail-closed |
| 数据库与对象存储不是同一事务 | 准备对象保持内部不可读；激活事务绑定获准摘要；清理失败保留 tombstone/重试依据 |
| Demo 内存限流只限单实例 | 另行实现共享限流；B1 不提高公开配额 |
| 同源 Worker 不能承载不可信第三方代码 | 保持本地可信 Demo；独立 origin 沙箱和审核另立范围 |
| main 的 Git 发布可能早于人工数据库步骤 | Owner 合并前核实并处理 Vercel 自动发布；无生产 migration 的部署须保持 Registry flag 关闭 |

下一轮单独授权后按以下依赖实施，不在 B1 自动开始：

1. 冻结 DraftDTO / Version / ReleaseDTO 及 0.5.0 语义边界，明确与 `aig.capability/0.1` 的版本关系；DTO 拒绝 owner/storageRef/credential/未知字段并采用字段白名单。
2. 建立公共的服务端命令认证/动作授权、审计及事务锁框架；实现 Draft revision 的 If-Match/CAS、编辑/提交/撤审与 review 失效。
3. 从可信内容生成 `JCS-SHA256-v1`，加入 RFC 8785 跨语言 golden vectors、重复 JSON key/非法 Unicode/非有限数拒绝、资产摘要闭合集；不靠普通 JSON.stringify 冒充 canonicalization。
4. 实现独立审核命令和 Version 原子封存（reviewer ≠ submitter、当前角色/资格、政策/资产新鲜性、review expiry/epoch/revision）；版本冲突与响应丢失可证明安全。
5. 实现 publish/withdraw/rollback 事务、幂等键与 bodyHash、并发/重放/撤权测试；回滚创建新的审核与 Release，不复活已撤回 URL、不改旧 Version。
6. 补齐独立资产授权与存储闭环后实现严格 ReleaseDTO 的公开读取；PRIVATE 一律 404、UNLISTED 不进入目录/搜索/metadata，禁止 fallback 到 Draft/源文件/用户数据。全部验收后才替换 `source.ts`。
7. 持久运行协议另作明确子交付：保留既有 Run Lifecycle，定义持久任务/幂等/超时/取消/事件恢复/回调签名，再复用 executeRun；不悄悄改变 `/api/demo/v1/runs` 的同步 200 协议。第三方能力、Grant、BYOK、外部执行和 GPU 继续按独立授权门禁处理。

B1 验收交付后停止，等待 Owner 对下一阶段的明确指令。
