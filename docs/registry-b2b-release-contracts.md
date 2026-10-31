# P1-B2-B：Release 命令与公开投影契约

基线为 `main@aef73167f2ec0135d01a8c5005c4e153007bc734`，已合并 PR #37。继承 B1 Registry、B2-A Draft / Review / Version 和 `JCS-SHA256-v1`。本轮交付默认关闭的内部 Release 命令核心；公开内容和资产分发保持拒绝。验收结果与候选提交见 [本轮验收记录](registry-b2b-validation.md)，本文的契约要求不作为测试通过声明。

## 内部接口

`features/registry/release.ts` 为 `server-only` 库，无 HTTP 路由。必须同时设置 `REGISTRY_INTERNAL_ACCESS_ENABLED=true`、`REGISTRY_RELEASE_COMMANDS_ENABLED=true` 才进入命令。缺省、false 或其他值均拒绝。B2-A 的 Draft / Review flag 不代替 Release flag；迁移不为任何真实用户授予资格。

| 函数 | 独立动作资格 | 项目角色 | 输入与效果 |
| --- | --- | --- | --- |
| `getRegistryReleaseHead` | `READ_RELEASE` | 任意活动内部成员角色 | 仅返回内部 Release 头与强 ETag |
| `requestRegistryReleaseApproval` | `REQUEST_RELEASE` | OWNER / PUBLISHER | `{versionId, expectedContentHash, intent, targetReleaseId?}`；固定本次发布请求，不改变 Version |
| `approveRegistryRelease` | `APPROVE_RELEASE` | REVIEWER | `{requestId}`；独立审核者为请求追加批准事实 |
| `publishRegistryRelease` | `PUBLISH_RELEASE` | OWNER / PUBLISHER | `{approvalId}`；消费本次 PUBLISH 批准，创建新 Release 并原子切换当前指针 |
| `withdrawRegistryRelease` | `WITHDRAW_RELEASE` | OWNER / PUBLISHER | `{releaseId}`；追加撤回事实；撤回当前 Release 时清空指针并使项目 PRIVATE，撤回历史 Release 时保留当前指针 |
| `rollbackRegistryRelease` | `ROLLBACK_RELEASE` | OWNER / PUBLISHER | `{approvalId}`；消费本次 ROLLBACK 批准，基于指定历史 Release 的不可变 Version 创建全新 Release |

全部输入对象拒绝未知字段。写调用公共外层为 `{accessToken, projectId, ifMatch, idempotencyKey, input}`。不接受调用方提供的 owner、publisher、reviewer、epoch、policy、资产 digest set 或时间。用户登录、ADMIN、OWNER、JWT metadata 或其他动作资格都不能代替当前所需的独立动作资格与项目角色。

Auth 每次验证真实 token 后，事务再核对 `auth.sessions`、subject、session_id、JWT exp 和会话 not_after。敏感命令不能只相信尚未过期的 JWT。项目、当前资格、动作、成员及资产行采用事务锁；项目命令使用 Serializable 隔离和有限冲突重试。所有效果及 receipt 写入后，再使用同一数据库时钟复检参与者资格、调用会话和审批期限；自然过期即使没有触发 epoch 更新也会拒绝并整体回滚。

## 发布审批与不可变历史

发布请求绑定 project、Version、实际 canonical 内容哈希、Version visibility、当前 policy revision、当前项目授权 epoch、当前 Release 头、资产 digest set、requester、intent、可选 rollback target 和数据库起算的 15 分钟期限。当前 `RELEASE_POLICY_REVISION=1`；策略 revision 变更须同步应用与前向数据库迁移，不复用旧批准。APPROVE 需当前独立 reviewer，禁止 requester 自审。最终 publisher 必须是原 requester，并有最终动作资格；PUBLISH 与 ROLLBACK 批准不能互换。

SEALED 是 Version 已冻结的历史事实。Version 原来的 Review 不是发布授权；旧 Review 的自然过期不会阻止对旧 Version 走全新的发布审批，但显式失效或内容、项目、哈希不匹配必须拒绝。新流程重新检查当前政策、资产和参与者。重新发布与回滚都不能复活旧批准、旧回执或撤回的 Release；每次必须生成新的请求、独立批准和 Release ID。

Version、封存文档、终态 Review、发布请求、批准、Release 发布事实、撤回事实和成功回执保留审计历史。撤回与替换通过追加事实表达，不能改写原发布内容、时间、版本或授权。旧 Release 的历史状态不等于当前可分发；调用方不能据历史 `PUBLISHED` 值恢复旧 URL 或绕过当前指针。

## CAS、幂等与安全重放

`ifMatch` 必须是内部头接口返回的强 ETag，格式为包含双引号的 `"release:<project uuid>:<project revision>"`。没有条件返回 `PRECONDITION_REQUIRED`；非法或弱 ETag 拒绝；头不一致返回 `PRECONDITION_FAILED`。不能只比较 currentReleaseId：`none → 新发布 → 撤回 → none` 仍是不同 revision，旧请求不能穿过这一轮变化。批准还绑定请求时的当前头，版本竞争和跨阶段过时请求不能消费。创建请求 / 批准不改项目 revision；发布、撤回、成员 / 动作 / 资格变更等项目变化使旧头过时。

幂等作用域为 project / actor / key，动作与规范请求哈希固定。相同键不同内容或动作返回 `IDEMPOTENCY_CONFLICT`。receipt 和本次状态效果同事务提交；响应丢失后同一请求可以恢复已提交结果，不再次创建批准、Release 或撤回事实。失败事务不留下成功 receipt。

每次重放重新认证、定权并检查当前 epoch。请求、批准以及发布 / 回滚成功的重放都重新检查原请求期限、参与者当前权限、Version 和资产绑定；超出期限后不能恢复原成功响应，应读取内部头并重新审批后执行新的操作。发布成功的重放只确认原提交结果，不能被当成新的授权或再次激活历史 Release。当前头已替换或撤回、审批失效、权限撤销 / 重新授予造成 epoch 变化等情况返回过时或拒绝，不输出过时的“当前已发布”响应。receipt 结果使用服务端完成本次状态变化后的项目 epoch，避免合法 visibility 变化使自己的 receipt 立即失效。

## 内容与资产绑定

服务端从已锁定的同项目 Version 重新解析严格快照、校验身份与版本，再计算 `JCS-SHA256-v1`。客户端 `expectedContentHash` 仅为一致性条件。批准绑定实际哈希，而不是仅绑定 versionId 或 semver。

引用覆盖 documentation、IMAGE、MARKDOWN 来源、科研声明与已报告指标。每个引用必须是当前同项目、APPROVED、CURATED、用途与 MIME 匹配的资产；批准固定 sourceDigest、deliveryDigest、scanRevision、mime、size、dataClass 和 rights/provenance 摘要。请求、批准、消费阶段均复核，资产退休、摘要或授权变化必须拒绝。封存文档引用须与 Version 快照对应，不能从 Draft 补齐或混入其他版本。

这些检查只证明数据库登记的一致性。`storage_ref` 字符串、APPROVED、rightsRef 或 digest 字段都不能证明实际对象存在、字节已验证、文本已净化、授权证据完备或存储 ACL 正确。当前没有 Registry 对象导入、净化、不可变对象验证、独立访问控制与撤回分发闭环。因此本轮不创建公开对象、不签名 Registry URL，也不将 ProjectAsset 接入现有私有工具图片或头像服务。

## PUBLIC / UNLISTED / PRIVATE 投影与失效

`getPublicRegistryRelease` 当前对所有输入统一返回 `NOT_FOUND`。它不查询或序列化 Draft、Version、Review、receipt 或资产地址，没有 flag 可以打开分发。PUBLIC / UNLISTED 是批准的目标可见性和内部状态，不能据此宣称项目已经公开可读。PRIVATE 不产生公开 ReleaseDTO。

后续公开服务必须另行交付以下规则，不能仅删除拒绝分支：

| visibility | 未来允许的投影 | 必须拒绝的内容 |
| --- | --- | --- |
| PUBLIC | 当前有效 Release 的严格 `ReleaseDTO`；可进入公开列表与发现 | Draft、raw Version / ORM 行、私有资产、owner / 成员 / 审批主体、epoch、rightsRef、provenance、storageRef、receipt |
| UNLISTED | 当前有效 Release 的直接查询；不进入列表、搜索、sitemap 或发现 | 与 PUBLIC 相同的内部信息；不得把难猜 ID 当作私密权限 |
| PRIVATE | 无公开查询、列表、摘要、资产或历史投影 | 所有内部 Registry 数据 |

公开读取与资产请求必须同时验证项目未归档、currentReleaseId、Release 未撤回 / 替换、项目 visibility 与批准一致、当前 policy、授权 epoch 与资产授权。撤回、替换、转 PRIVATE、成员 / 动作 / 内部资格变更、审核显式失效、资产退休等变化后，旧 URL 与旧缓存均应失效；自然期限到期也须实时检查，不能等待 UPDATE trigger。不得回退到上一 Release 或 Draft。

公开 DTO 只从同一个已批准 Version 的白名单字段构造，并经 `releaseDTOSchema` 验证；但结构 schema 不净化自由文本，不能当作安全发布边界。未来对象服务必须把 Release 和资产验证结果绑定，并给出数据库提交与对象激活之间的失败恢复、缓存清除和在途 URL 失效方案。未能证明当前有效、依赖超时或检查失败一律不分发。

## 错误与后续 HTTP 适配

库使用稳定错误码，不将 SQL、凭据或外租户标识放入响应。身份错误为 `AUTH_REQUIRED`，缺动作资格为 `FORBIDDEN`，跨项目或不可见资源为 `NOT_FOUND`；输入、CAS、重复键、过时重放、审批失效和事务冲突分别拒绝。调用方须使用 code / status，不解析 ORM 消息。

未来 HTTP 适配还需独立验收严格 UTF-8 字节解码、正文大小、限流、CSRF / origin 边界、错误映射和幂等头。当前没有 Registry HTTP API、公开上传、自助注册、第三方执行、BYOK、Grant 或 GPU，不修改两个 Demo 的 API 或 Explore 数据源。
