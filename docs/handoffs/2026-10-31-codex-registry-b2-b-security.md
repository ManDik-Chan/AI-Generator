# P1-B2-B：Release 安全交接

本轮基于 PR #37 合并后的 `main@aef73167f2ec0135d01a8c5005c4e153007bc734`，独立分支为 `codex/p1-b2-b-release-20261031`，工作区为 `D:/AIGC/p1-b2-b-release-20261031`。目标为 Registry Release 发布、撤回与回滚的内部服务端协议；公开分发保持默认拒绝。

接口、授权、CAS、幂等、不可变历史和公开投影定义见 [Release 契约](../registry-b2b-release-contracts.md)。最终候选提交、迁移 checksum、真实数据库执行及 CI 状态由 [本轮验收记录](../registry-b2b-validation.md) 与 Draft PR 给出，不能复用 B1 / B2-A 的历史通过记录。

## 已交付边界

独立 Release 动作资格与项目角色分离。当前 Auth 会话、内部资格、动作、成员、项目 epoch、Version canonical 内容、visibility、当前头和全部资产引用都参与事务校验。旧 SEALED Version 和原 Review 只提供不可变内容来源；发布与旧版本回滚另走新鲜请求、独立审批和消费流程。撤回、替换与回滚保留原始发布历史。

新命令由 `REGISTRY_INTERNAL_ACCESS_ENABLED=false` 与 `REGISTRY_RELEASE_COMMANDS_ENABLED=false` 关闭；B2-A 的 `REGISTRY_DRAFT_REVIEW_ENABLED=false` 继续保留。迁移本身不授予真实主体资格；不得从测试 fixture 导入账号、operator 或 action seed。

内部库函数没有路由调用。`getPublicRegistryRelease` 无条件拒绝；不生成对象 URL、不写公开 bucket、不开放项目注册。既有 Demo Runtime、开发者 OpenAPI、Claude 完成的主页和交互、Explore fixture、第三方执行、BYOK、Grant、GPU 均未接入本轮流程。

## 资产存储审计与公开发布阻塞项

| 已有基础 | 缺口 | 本轮处理 |
| --- | --- | --- |
| ProjectAsset 同项目外键、状态、MIME、digest、scanRevision、rightsRef、provenance | 字段由可信服务端登记，不能证明对象存在或字节与摘要一致 | 在 Release 三阶段复核登记绑定；实际分发拒绝 |
| 不可变 Version 与同事务封存的文档引用 | Markdown / 自由文本尚无 Registry 净化和敏感内容审核流水线 | 不把 `releaseDTOSchema` 当净化器；公开投影拒绝 |
| P1-A 私有 Tool / GeneratedImage / PersonaAvatar 归属和删除协议 | 对象身份类型不含 Registry；现有用户私有 bucket 不能自动成为项目公共 origin | 不复用 storage_ref 字符串签名，不扩展旧资产授权 |
| 发布、撤回、当前指针与 receipt 的数据库事务 | 对象复制 / 激活、失败补偿、CDN / signed URL 撤回不在同一个数据库事务 | 不提前激活对象服务或长寿命公开 URL |
| 内部 RLS / ACL 默认拒绝 | 公开读服务尚未证明每次检查 epoch、visibility、资产状态与自然到期 | 公开 resolver 始终 NOT_FOUND，不允许 env flag 绕过 |

下一阶段需独立实现 Registry quarantine → 净化 → 实际字节验证 → 不可变交付对象 → 独立 origin ACL。对象身份必须绑定项目、Release、资产、内容摘要与扫描 / 净化策略 revision，不能接受任意 bucket/path/URL。每个公开请求必须验证当前 Release 与资产授权，不把历史批准缓存当作实时权限。

随后才实现严格公开 ReleaseDTO、PUBLIC 发现与 UNLISTED 直接读取，以及撤回 / 权限 / 策略 / 资产变化后的旧 URL、缓存与在途请求失效。最后另行决定是否替换 Explore 数据源。流程没有达到这些验收前，公开拒绝分支必须保留。

## 运行和验收要求

仅可使用显式命名、loopback 绑定且确认可丢弃的本地 PostgreSQL / Supabase。不得加载应用 dotenv、使用 linked project、连接或查询生产 Supabase。保持 P1-A、B1、B2-A 安全套件，新增真实 Auth / JWT / PostgreSQL 的越权、租户隔离、自然到期、审批失效、锁竞争、幂等响应丢失、撤权重放、旧版本回滚和事务末端过期验收。

本地按 `D:/AI-Generator/AGENTS.md` 禁止启动或连接浏览器。保留全部必需 CI、Node 24、Python JCS 和远端浏览器矩阵；不能通过删 job、扩大 skip、修改 required contexts 或关闭检查获取通过。

数据库 owner / Prisma 连接仍属可信服务端，不能将通用 SQL、任意 ORM 写入或测试 superuser trigger bypass 暴露给用户。私有表启用 RLS、没有客户端 GRANT / policy，helper 固定 search_path 并撤销公开 EXECUTE。生产 operator provisioning、审计留存与策略升级仍需独立运维流程。

## 迁移与回退

不修改已应用的 24 项历史 migration；单独追加 `20261031054426_registry_release_commands`，全链共 25 项。新增 private `release_requests`、`release_approvals`、`release_withdrawals`、`release_receipts`，并给既有 Release 增加 authorization_id / published_by 绑定。旧行的这两个字段保持 NULL，不伪造历史授权；没有新批准的旧 Release 不能重设为当前 Release。验证需覆盖空库、重复 deploy、带历史实体的增量升级、故障注入回滚及全链 checksum。

本轮不执行生产迁移或部署。分支在 `vercel.json` 禁用 Git preview deployment；此设置不能代替 Owner 合并前核对 main 自动部署、dashboard override 和外部 webhook。install / prebuild 不增加自动迁移路径。

新增迁移事务失败只回滚自身。已提交后的应用回退先关闭所有 Registry flags 并回退应用，保留 schema、RLS、ACL、Version / Review / Release、审批、撤回与幂等回执。不能通过删除历史、修改已应用 migration、授客户端写权限或恢复旧公开 URL 回退；schema 问题采用独立批准的前向修复。备份 / PITR、生产窗口、资格 provision 与生产执行另行批准。

最终仅交付独立 Draft PR，附对应 head 的验收证据、风险和阻塞项。main 由 Owner 亲自合并；完成本轮后停止，等待 Owner 验收，不自动开始对象分发或公开读取阶段。
