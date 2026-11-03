# 交接：P1-F2 Registry 真实项目创建与草稿编辑（Claude，2026-11-03）

> 分支 `claude/p1-f2-registry-write-20261103`，基于 `main` `ac0a325`（PR #56、#57 合并后）。
>
> 未修改：Registry 后端（`features/registry/**`、`app/api/**`）、数据库迁移、RLS、Auth / Session / middleware、平台 RBAC、`/admin`、`features/platform/source.ts`、功能开关与部署配置、CI 工作流、Demo 计算逻辑、Landing。
>
> 浏览器：按 `AGENTS.md`，未启动或连接任何本地浏览器，未截图、未运行本地 E2E。未连接生产 Supabase。

## 1. 交付内容

开发者控制台的 Registry 模式（`/developer/registry`，需登录）从只读扩展为“读取 + 两项写入”：

| 能力 | 入口 | 接口 |
| --- | --- | --- |
| 查看真实项目与自身资格 | `/developer/registry`（原有） | GET `/qualifications`、`/projects` |
| 创建项目 | 概览页「创建项目」 | POST `/projects` |
| 读取草稿与版本信息 | 项目页（原有）与新编辑页 | GET `/projects/:id`、`/draft/head`、`/draft` |
| 编辑并保存完整草稿 | 项目页「编辑草稿」→ `/developer/registry/projects/:id/draft` | PUT `/projects/:id/draft` |

Mock 模式（`/developer`、`/platform/developer`）未改动。审核、封存、发布、撤回、回滚与资产命令仍不可用，界面写明“本控制台不提供”。

## 2. 设计决定与依据

### 2.1 入口：权限驱动

- **编辑**只在服务端确认时提供：项目读取返回的 `effectiveActions` 含未到期的 `EDIT_DRAFT`（服务端已与 OWNER/EDITOR 角色求交），且草稿状态为 `DRAFT`。否则项目页和编辑页显示具体原因（`write-view.ts` 的 `editAccess`）：
  - 没有 EDIT_DRAFT：OWNER/EDITOR 但无资格，界面明确“项目所有者不会自动获得这项资格”。
  - 没有编辑角色。
  - 草稿在审核中、已封存或已归档。
  - 资格未知：项目读取失败时，不猜测有权限。
- **创建**：见 2.4。创建表单只在 `/qualifications` 读取成功后出现。读取失败、接口关闭或会话失效时不显示，并说明原因。
- 不提供没有执行能力的按钮。每个写入按钮都发送真实请求，结果由服务端判定。

### 2.2 未保存草稿：页面内存

- 编辑器把**服务端确认的版本**（`base`，含 ETag、revision、确认方式与时间）和**工作副本**（`working`）分开保存。顶部状态条始终显示二者的关系：“与服务端一致 · rev N”“有未保存的修改 · 基于服务端 rev N”“保存结果未知”。
- 工作副本保存在 Registry 布局的 Provider 内存中。在控制台内切换页面不会丢失，项目页会提示“你有未保存的修改”。刷新、关闭页面或离开站点前由 `beforeunload` 提醒。界面也写明：刷新、关闭、退出登录或浏览器崩溃后无法恢复。
- 不写入 localStorage、sessionStorage、IndexedDB 或第三方服务，也没有新的服务器存储。恢复手段是手动「导出草稿 JSON」（本地下载，由用户点击触发）。
- 409、412、429、401、403、404、DISABLED、网络中断与未知结果都不会清空工作副本。

### 2.3 冲突恢复：不静默覆盖

- 以下三种情况都会打开冲突面板：412；重新读取时发现草稿已变而本地有未保存修改；结果未知后核验读取发现草稿变为其他内容。
- 冲突面板逐项对照“我的 / 服务端”的差异（名称、简介、版本、类别、可见性、能力、研究声明、展示标题、章节、文档）。
- 两个明确选项：
  - **保留我的修改，基于服务端版本继续**：基线改为服务端当前 ETag，工作副本不变，下一次保存是新的操作，使用新的幂等键。
  - **采用服务端版本**：需要二次确认。
- 冲突未解决前不能保存。

### 2.4 创建资格：接口未提供，提交时由服务端判定

C2 契约第 1 步写“读取 `GET /qualifications` 以呈现创建资格”，但该接口只返回 14 项项目操作资格，`can_create` 在任何读取接口中都不存在（`features/registry/read.ts` 第 23–36 行）。前端事先无法知道用户能否创建。处理方式：

- 只对已被服务端确认为有效内部操作员的账户（`/qualifications` 读取成功，即持有 READ_DRAFT）显示创建表单。
- 表单旁明确写出“这项资格不在资格列表里返回，提交后由服务端判定；没有资格会得到 403，不会创建任何内容”。
- 服务端返回 FORBIDDEN 或 DISABLED 后，本次访问不再显示表单，只显示服务端结果与时间。

这是在现有契约下最接近“不猜测”的做法：按钮会执行真实请求，但不声称用户有资格。最小接口需求见第 7 节。

## 3. 请求规则（`write-client.ts`、`draft-editor.ts`、`create-store.ts`）

- **身份**：只用 `Authorization: Bearer`，`credentials: "omit"`。令牌每次请求现取，不存储、不进入结果或错误。Origin 由浏览器自动附加，客户端不设置（集成测试断言了这一点）。
- **幂等**：每个逻辑操作分配新键（`create_…` / `draft_…`）。请求体只序列化一次。只有结果未知时，才用同一个键、同一份请求体和同一个 If-Match 重发。确定的拒绝会结束这次操作，之后的提交使用新键。
- **ETag**：首次保存未初始化草稿时，If-Match 用草稿头的 ETag。之后用保存响应或读取返回的 ETag。
- **结果分三类**：
  - `ok`：契约校验通过。保存响应还要核对项目绑定、ETag 头与正文一致，以及服务端保存的内容与发送内容按值相等。
  - `rejected`：服务端返回已知错误码，或客户端拒绝发送。
  - `unknown`：无响应、超时（20 秒）、503、无法解析的 5xx，或响应不符合契约。
- **未知结果**：
  - 自动读取一次草稿头进行核验。草稿变为本次发送的内容时，确认为已保存（标注“核验”）。仍是原版本时提示“可能未生效或仍在处理”。变为其他内容时转为冲突。
  - 用户可以“用同一请求重试”“重新核验”或“放弃这个请求”。
  - 未知结果从不显示为成功。
- **重放成功**（`replayed: true`）：之后再读一次草稿头，确认是否已有更新的版本。
- **429**：按 Retry-After（缺省 60 秒）暂停所有写入。暂停期间不发送请求，界面按时钟自动恢复。
- **撤权与会话**：
  - 403、404 锁定保存，并重新读取项目资格，界面立即反映服务端的最新判定。
  - 401 锁定保存，提供“在新标签页登录”（不离开本页，内容不丢）与“登录后重新读取”。
  - DISABLED 显示“写入接口未开启”，不回退 Mock。
- **本地预检**：结构不符、manifest 与 presentation 的项目或版本不一致、slug 不属于本项目、章节 ID 重复时，不发送请求，并列出问题。其他内容约束（资产归属等）由服务端判定。

## 4. 变更文件

新增：

- `features/developer-console/registry/write-contract.ts`：写接口响应与错误码的浏览器镜像（服务端 `write-contracts.ts` 依赖 Node 哈希，不能进浏览器），以及本地预检、按值比较。
- `features/developer-console/registry/write-client.ts`：POST / PUT 客户端。
- `features/developer-console/registry/create-store.ts`、`draft-editor.ts`：创建与编辑状态机。
- `features/developer-console/registry/write-adapter.ts`：写入适配器，与读取适配器并列，不嵌套 Mock。
- `features/developer-console/registry/write-view.ts`：编辑资格判定与错误文案。
- `features/developer-console/components/registry-create.tsx`、`registry-draft-editor.tsx`：界面。
- `app/developer/registry/projects/[projectId]/draft/page.tsx`：编辑页（服务端只做登录与 ID 形状检查）。
- 测试：`features/developer-console/registry/write.test.ts`、`features/developer-console/components/registry-write-render.test.ts`、`tests/fixtures/registry-console-write.ts`、`tests/integration/developer-console-registry-write.integration.test.ts`。

修改：

- `registry-provider.tsx`：同一 Provider 内增加写入上下文。
- `registry-workbench.tsx`：创建区块（以插槽传入）。
- `registry-project.tsx`：草稿面板的编辑入口或原因；侧栏写入命令状态。
- `registry-kit.tsx`、`registry-header.tsx`、`console-mode-switch.tsx`：文案从“只读”改为“真实数据 · 两项写入”。
- `registry/store.ts`：新增 `invalidate()`，保存后只标记项目读取过期，不立即发起 8 个 GET，避免消耗每分钟 60 次的读取额度。
- `registry/adapter.ts`、`registry/view.ts`：注释。
- `registry-render.test.ts`、`isolation.test.ts`：同步文案与新增页面。隔离测试仍断言 Registry 模式不触达 Mock、浏览器哈希或任何服务端模块。

## 5. 测试

本地（Windows，Node 22，未启动浏览器）：

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过（0 warning） |
| `pnpm test` | 211 个文件 / 1676 项通过；17 个文件按环境跳过（Supabase 集成，含本 PR 新增的一个） |
| `pnpm build` | 通过；新路由 `/developer/registry/projects/[projectId]/draft` 为动态页 |

单元测试（有状态的 Fake Registry，模拟 ETag、回执、撤权、开关、限流、提交后断线）覆盖：

- 请求帧：Bearer、无 Cookie、不设置 Origin、精确请求体与请求头。
- 创建：首次创建、结果未知后同键重放、slug 冲突、新提交换新键、FORBIDDEN / DISABLED 后不再发送。
- 首次保存（使用草稿头 ETag，模板未完成时不发送）、再次保存（新键 + 新 ETag）、重复点击只发送一次。
- 412 冲突两种选择、重新读取不丢修改。
- 撤权后 403 锁定且资格重读为 no-grant；401 后重新登录恢复；DISABLED 不回退。
- 429 按 Retry-After 暂停。
- 未知结果的三种结局（已提交经核验确认、未提交保持未知且重试字节一致、重试得到重放）。
- 编辑资格规则（OWNER 无 EDIT_DRAFT、无角色、非 DRAFT 状态、过期、项目读取失败）。
- 契约镜像与服务端信封、错误码一致。
- 服务端渲染：无资格时表单禁用并说明原因、未知不显示成功、冲突对照、拒绝后无创建表单、文本转义。

集成测试 `developer-console-registry-write.integration.test.ts`：使用真实 Supabase JWT 与隔离 PostgreSQL，直接调用导出的路由处理函数。由 CI「Supabase Security Acceptance」执行，本地按环境跳过。覆盖：

- 创建、提交后断线的同键重放（数据库中只有一个项目，OWNER 成员关系存在）。
- 首次与再次保存，回读的服务端哈希与工作副本一致。
- 并发写入造成 412 后显式保留我的修改。
- 未知结果经核验确认、且没有第二次写入。
- 仅 OWNER 无 EDIT_DRAFT 时判定为 no-grant；会话中撤权后 403 并保留修改。
- 无 `can_create` 时 403 且数据库无记录。
- 写入开关关闭时 DISABLED；退出登录后 401；两者都未写入数据库。

**未验证**：Next.js 入口与反向代理（集成测试直接调用路由函数，与 C2 交接相同）；真实浏览器中 Origin 自动附加、`beforeunload` 提示与布局（本地浏览器授权暂停）。

## 6. 演示步骤（需要已开启开关的隔离环境）

Preview 的 Registry 开关默认关闭，只能演示“接口未开启”的真实状态。完整流程需要一个开启了 `REGISTRY_INTERNAL_ACCESS_ENABLED`、`REGISTRY_INTERNAL_READ_ENABLED`、`REGISTRY_INTERNAL_READ_HTTP_ENABLED`、`REGISTRY_INTERNAL_WRITE_HTTP_ENABLED`、`REGISTRY_DRAFT_REVIEW_ENABLED` 的隔离环境，以及一个持有 `can_create`、READ_DRAFT、EDIT_DRAFT 的内部操作员账户。不要在生产环境开启。

1. 登录后打开 `/developer/registry`，确认资格列表与「创建项目」区块。
2. 输入 slug，点击「创建私有项目」，确认 201 结果与「打开项目」链接。
3. 项目页草稿面板显示「写入第一版内容」，打开编辑页。
4. 补全简介，点击「保存草稿」，确认 rev 2 与“已由服务端确认保存”。
5. 修改标题，再次保存，确认 rev 3。
6. 冲突：在另一标签页同一编辑页保存一次，回到第一个标签页修改后保存，确认 412 冲突面板与两个选项。
7. 撤权：撤销该账户的 EDIT_DRAFT 后保存，确认 403、修改仍在、编辑页变为只读说明。
8. 用无 EDIT_DRAFT 的 OWNER 账户打开项目页，确认“项目所有者不会自动获得这项资格”。

## 7. 需要 Codex 处理的接口需求（非阻塞）

**创建资格不可读。** C2 契约要求前端用 `/qualifications` 呈现创建资格，但没有字段承载 `can_create`。最小需求，二选一：

- 在 `qualificationsDTOSchema` 增加 `create: { expiresAt } | null`（取内部操作员 `can_create` 与 `expires_at`）。这是严格 schema 的新增字段，需要同步 `features/registry/query-contracts.ts` 与文档。前端镜像会随之更新。
- 或新增 `GET /qualifications/create` → `{ result: { expiresAt } | null }`，同样需要 READ_DRAFT。

接口可用后，前端只需把创建表单的显示条件从“已确认为内部操作员”改为“服务端确认有创建资格”，并删除“提交后判定”的说明。

**另记（非需求）**：503 `UNAVAILABLE` 不带 `Retry-After`，前端按未知结果处理、由用户手动重试，没有自动退避。

## 8. Owner 验收清单

需要 Owner 亲自验收（本地浏览器授权暂停，未目测）：

1. `/developer/registry` 在开关关闭时：读取接口未开启的整页状态，无创建表单、无 Mock 数据。
2. 开关开启的隔离环境中：概览页「创建项目」区块的说明与布局（390 / 1440）。
3. 编辑页：粘性状态条、表单与「完整 JSON」切换、问题列表、导出、冲突面板、未知结果面板在 390 / 1440 与深色模式下的效果。
4. 有未保存修改时刷新或关闭标签页，浏览器出现离开提示。
5. 401 时「在新标签页登录」后回到原页「登录后重新读取」，修改仍在并可保存。
6. 项目页草稿面板的编辑入口与各种“不能编辑”原因的文案。
7. 合并前确认本 PR 精确 head 的 Security Acceptance 结果，其中包含新增集成测试。
