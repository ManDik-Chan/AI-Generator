# P1-B2-A 隔离验收 — 2026-10-31（Asia/Singapore）

基线：`main@6a92061`，已包含 #29。独立 worktree：
`D:/AIGC/p1-b2-a-draft-review-20261031`，分支
`codex/p1-b2-a-draft-review-20261031`。实现提交 `ad56d895189723c1c4c5d2de940475a3453f54df`；
随后提交仅补充验收记录。最终 head、测试合并 SHA、CI run/job 链接与实际结论在本 PR 正文中记录；
本轮没有借用 B1 或旧 PR 的通过结果。开发过程的本地结果不代替最终 head 的 CI。

## 隔离与迁移

测试栈 `aig-platform-p1-final-b2a-20261031`，PostgreSQL 17 / CLI 2.109.1，API/DB 经容器 label、CLI status、
独立 disposable marker 核对并绑定 `127.0.0.1:59321/59322`。没有 linked project，没有加载应用 dotenv，
没有使用生产 Supabase。Docker 在准备期间由 Owner 重新打开；本轮测试库写入在引擎恢复并检查后才开始。

原 23 个已合入 main 的迁移保持原样。新增 CLI 生成的独立事务迁移：

```text
20261030174407_registry_draft_review_commands
SHA-256 fc960dbcd24628b2397cee9bab26be96f8aff5ef1648bd30b08e8411591b0eb2
```

文件名使用 CLI 生成的 UTC 时间戳，交付日期使用 Asia/Singapore。新增三张 private 表的 RLS 默认拒绝，
无 anon/authenticated/service_role 权限，无真实主体资格种子。未改变 B1 八实体的直接 SELECT/RLS 基础；
新六动作资格控制的是服务端命令，不应误称为改写了既有 B1 数据 API 的读取策略。

| 检查 | 本轮本地结果 |
| --- | --- |
| 原 main → 新迁移、原八实体已有数据保存 | 通过；升级前填充全部 B1 实体、内部资格和 synthetic Auth 主体 |
| Registry 每条事务 COMMIT 前故障注入 | 通过；schema/ACL/RLS/函数/触发器/约束/类型及已存在数据快照保持 |
| 空库安装、重复 deploy、迁移账本 | 通过；24 个迁移名称/时间戳/完成状态/SHA-256 一致 |
| private schema DB lint | 通过，无 schema error |
| security advisors（fail-on WARN） | 已运行，exit 1；保留 main 旧函数 public.memory_keywords_valid 的 search_path WARN，新 Registry 无该告警 |
| 最终 synthetic 夹具 | Auth accounts / Registry projects / operator_actions / receipts / invalidations = 0 / 0 / 0 / 0 / 0 |

迁移失败只回滚该文件事务，已提交的历史前缀保留。没有为了使 advisor 清零而修改历史 migration 或压制告警。
上述旧函数是既有 invoker / immutable SQL validator，作为独立历史加固风险记录。

## 真实安全、契约及兼容性

| 检查 | 本轮结果 |
| --- | --- |
| 真实 Auth / PostgreSQL / JWT / PostgREST 集成 | 9 个文件、100/100 tests；0 skip/TODO；包括原 69 项及新增协议 31 项 |
| Node 22 lint / typecheck | 通过，零 lint warning |
| 非数据库单元测试 | 161 文件、1073 项通过，0 skip；集成测试另行真实执行 |
| Node 22 build | 通过；现有 Demo 与 docs 预渲染成功 |
| DTO / JCS 定向测试 | 69 项通过；unknown fields、嵌套凭据/owner/storageRef、语义身份/版本、大小写重复引用等负例 |
| Python RFC-linked reference | 固定 commit 32a48195b9b20fe67b1795e39e4509f14d860b45；31 个跨语言 canonical bytes/hash 与 binary64 向量通过 |
| Demo API 真实 HTTP | 12/12 通过：JSON/SSE、超时 partial、OpenAPI、错误码与大小限制 |
| 公共页与未登录导航，HTTP only | 13 页面 200；六个受保护入口、/enter 与四种登录回跳通过；25 外层组 |
| docs:sync / diff check | 通过；Demo OpenAPI 与 Manifest schema、组件、样式、原 Demo/Auth 源码相对 main 无变化 |
| Node 24 fresh install / required CI / 远端浏览器矩阵 | 由本 PR 最终 head 运行，具体 run 和结果以 PR 正文及 checks 为准 |

新增 31 项覆盖：两 flag 默认拒绝；真实会话撤销/到期；ADMIN/metadata/JWT/owner 伪造；独立动作及项目角色；
跨项目 Draft/Review/asset 隔离；强 If-Match/CAS；并发编辑、重复键、响应丢失和动作/内容重放冲突；
资格/成员/动作撤销、恢复后旧 epoch 拒绝；独立审核与竞争决策；撤审后的追加失效；策略/哈希/资产状态新鲜性；
无 UPDATE 的自然资格/动作过期；撤审与封存竞争；严格、不可变 Version/文档及零 Release。

两项慢命令负例使用仅匹配本夹具 Draft 的临时 trigger，在最后冻结操作中延迟 5.2 秒，
使 reviewer action 或 review deadline 在最后一次普通 freshness 之后过期。它们验证最终统一 DB clock 检查拒绝，
Version、文档、Draft 与 receipt 整体回滚；finally 精确删除并核对本次 trigger/function。不是提前拒绝造成的假阳性。

最终代码还将文档行 ID 与 snapshot.documentation.id 对齐；全局已占用 ID 返回 CONFLICT，不泄露所属项目。
跨版本复制需要新的 document UUID。普通 CI unit 的集成 skip 不能计为安全通过；独立 security runner 对 skip/TODO/空套件直接失败。

JCS 向量 fixture SHA-256：`59bc0a046a5eb4496cf77aaf17801423f070e9ad3f6142d2fc9896efcaa6d546`。
固定参考验证新增独立 `Registry JCS Python reference` CI job；网络或校验失败必须失败，未替换或放宽既有六门。

## 证据与收尾

原始输出保存在 ignored test-results，包括 `local-stage-integration.log`、security integration JSON、
`local-stage-registry-migrations.log`、`unit-final.json`、`registry-jcs-python-20261031.log` 和 HTTP 报告。
JWT/本地服务密钥不提交或上传。HTTP 报告 SHA-256 为
`82eae94ffa42bcc96d200086fb7574b58191c9a28acc84428ff21b4bf14478c1`。
自有 HTTP PID 31028 已退出并确认其子进程及 3068 监听释放；本轮 Supabase 测试栈停止并删除临时数据。
未启动或连接本地浏览器，保留既有隔离 CI 浏览器门。

实现状态、错误/重放语义、安全模型、已实现与待实现接口、生产迁移/回退和 B2-B 实施顺序见
[契约说明](registry-b2a-contracts.md) 与 [安全交接](handoffs/2026-10-31-codex-registry-b2-a-security.md)。
没有生产迁移/部署、main 合并、公开发布、第三方执行、Grant、BYOK 或 GPU；交付后停止在 B2-A。
