# P1-B2-B 验收与证据边界

基线为 PR #37 合并后的 `main@aef73167f2ec0135d01a8c5005c4e153007bc734`。分支 `codex/p1-b2-b-release-20261031`，独立工作区 `D:/AIGC/p1-b2-b-release-20261031`；开始和交付前均重新核对 origin/main，不修改其他工作区。最终候选 SHA、完整安全执行结果、required checks、Node 24、Python JCS 和两个浏览器矩阵的对应 run 统一记录在独立 Draft PR 正文及 checks，不能引用旧 PR 或被替换 head 的通过结果。

## 本轮本地验证

| 验证 | 已完成证据 |
| --- | --- |
| 定向真实 Auth / PostgreSQL / JWT / PostgREST | Release 34 项 + B1 18 项，2 suites / 52 passed，0 skip/TODO；包含真实并发与事务末端到期 |
| Registry 全链迁移 | 全部 25 项 checksum、空库与重复 deploy、带 B1 八实体及 B2-A 动作/回执/失效事实的增量升级、四项 Registry 事务故障注入与 catalog/data 保留通过 |
| lint / typecheck / Prisma schema | 通过，零 lint warning；Prisma 使用惰性本地 URL 验证，不连接远程数据库 |
| 非数据库 unit | 161 files / 1073 passed；集成套件另行真实执行，不以被跳过的集成测试作为证据 |
| Node 22 build | 通过，53 个静态页面生成成功 |
| Python JCS | 固定官方参考 commit `32a48195b9b20fe67b1795e39e4509f14d860b45`，31 个跨语言 canonical bytes/hash 和 binary64 向量通过 |
| Demo API HTTP | 12/12 通过：JSON、SSE、partial timeout、OpenAPI、错误码、正文大小限制 |
| 公共页面与未登录导航 HTTP | 13 页面、六受保护入口、enter 与四登录回跳，共 25 外层组通过；未使用浏览器 |
| docs:sync --check / diff check | 通过；主页、交互、Demo 实现与公开 API、Explore 数据源未修改 |

隔离测试项目为 `aig-platform-p1-final-b2b-20261031`，loopback API/DB `60321/60322`，PostgreSQL 17、CLI 2.109.1。独立 marker、CLI status、容器 labels 和 loopback port bindings 均由既有守卫核对；没有 linked project，没有应用 dotenv，没有生产连接。

全量 `scripts/run-security-integration.mjs` 自动发现并要求每个 suite 和 assertion 实际通过，skip/TODO/空套件均失败。P1-A、B1、B2-A 与新 B2-B 必须在同一最终候选上真实执行，最终计数与日志以 PR 的本轮完整运行记录为准。既有 `verify-security-migrations.mjs clean / incremental / rollback-all` 继续执行；定向 52 项不能代替这些全量门禁。

## Release 安全覆盖

新套件覆盖双 flag 默认关闭；独立动作、项目角色、ADMIN / metadata / JWT 伪造；当前会话到期；跨租户 Version / request / approval / Release；SEALED 不能直接发布、自审拒绝、原 Review 自然过期后的全新审批；真实资格自然过期；policy、epoch、显式审核失效、内容哈希及资产退休；相同 key 并发和响应丢失重放；不同 key / 不同 Version 竞争；撤权与再授权不复活旧回执；撤回后的幂等、空指针 ABA、旧版本重新发布和 v2 → 历史 v1 回滚；PUBLIC / UNLISTED / PRIVATE 均不分发；原始 SQL 缺批准、错发布者、孤立发布拒绝；TTL 不接受伪造 created_at；遗留可见性不一致不阻止撤权；私有表与函数真实 ACL/RLS 和不可变历史。

两项末端到期测试在仅匹配本 fixture project 的 AFTER INSERT trigger 中等待 5.2 秒，使已经通过初始检查的审批或 reviewer 动作资格到期。断言真实耗时跨过等待，Release、当前指针、项目 revision/epoch 和成功 receipt 整体回滚；finally 精确删除测试 trigger/function 并确认不存在。测试 helper 与 superuser 清理只存在于受隔离守卫保护的测试中，runtime 没有 bypass 或删除入口。

B1 回归保留原测试及安全边界：原可变 Release 撤回成功断言升级为追加撤回事实且原行完全不变；旧 Release 不能直接重新设置为当前指针。旧 fixture 的无批准 Release 插入只在本地测试事务内模拟迁移前历史。B1 原 Version 资格过期断言仍实际验证封存拒绝；其无发布批准的 Release 插入现在先被新批准要求拒绝，不能将这条旧断言误称为发布资格过期证据，新套件另行提供新鲜 Release 审批后的真实到期证明。没有删除或跳过原安全测试。

## 迁移、默认拒绝与收尾

历史 24 项 migration 字节保持不变。CLI 新建 `20261031054426_registry_release_commands`，独立显式事务，全链 25 项；本地文件 SHA-256 为 `0d573c7102acd696a719da36cbc97202428a20f0a3b776d849b687a30b37c21a`。新增四张 private 表启用 RLS、无客户端权限、无真实资格种子；历史 Release 新列保持 NULL，不伪造授权。

公开 resolver 无条件 `NOT_FOUND`；即使内部批准目标为 PUBLIC/UNLISTED，也没有公开 DTO、对象 URL、上传、资产签名或分发入口。实际对象存在性、字节摘要、净化与独立 origin ACL 仍是阻塞项，详见 [安全交接](handoffs/2026-10-31-codex-registry-b2-b-security.md)。本轮不宣称公共发布已就绪。

原始报告保存在 ignored `test-results`，不提交 JWT/密钥。HTTP 报告 SHA-256 为 `80b41f65b19baf1021782e4e497174edcfe0a8ca8b6835b9052ab668384f17df`，自有 HTTP PID 10728 / 36924 已退出，3069 无监听。完整安全测试后的 fixture、测试栈与监听清理，以及本地 security advisor 的实际结果由 PR 收尾记录列明。

本地遵守 AGENTS.md，不启动或连接浏览器。原 required CI、Node 24、Python JCS 与远端浏览器矩阵全部保留；不通过关闭 job、修改 required contexts 或扩大 skip 获得通过。分支禁用 Vercel Git deployment；不执行生产迁移、生产部署或 main 合并，最终 main 合并仅由 Owner 执行。
