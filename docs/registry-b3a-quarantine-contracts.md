# P1-B3-A 私有 Quarantine 与字节证据

依赖门禁：Owner `ManDik-Chan` 于 2026-10-31 17:48:19（新加坡时间）合并 PR #38。独立分支基于 `main@64a571834a80a05045e3c6607e59576bc5b34fcf`，已核对最终 B2-B head `357c4f05fdd134afed93edd72a8aa7c0c0ece996` 的 Release 核心与合并结果一致。

本轮只建立私有对象来源与验证证据。现有 ProjectAsset、Version、Review、Release 的历史与授权语义保留；旧的 `APPROVED` 元数据不获得新的字节信任。公开 resolver 仍无条件拒绝。

## 服务端契约

`features/registry/quarantine.ts` 仅供可信服务端调用，没有 HTTP 路由。必须同时启用 `REGISTRY_INTERNAL_ACCESS_ENABLED` 和 `REGISTRY_QUARANTINE_ENABLED`；默认均关闭。不要求且不得因此打开 Release 发布开关。迁移不 provision 账号或资格。

| 命令 | 输入 | 资格与项目角色 | 结果 |
| --- | --- | --- | --- |
| stageRegistryAsset | `{accessToken,projectId,idempotencyKey,input:{assetId}}`，另传实际 `Uint8Array` | INGEST_ASSET；OWNER / EDITOR | `{id,state:"QUARANTINED"}` |
| verifyRegistryAsset | `{accessToken,projectId,input:{quarantineId}}` | VERIFY_ASSET；REVIEWER，且与 staging actor 不同 | `{id,state:"BLOCKED",reason:"SCANNER_UNAVAILABLE"}` |

所有对象严格拒绝未知字段；不接受 bucket、path、URL、owner、扫描结论、摘要、策略版本或 Release 标识。stage 立即复制输入缓冲区，绝不解引用旧 `storage_ref`、用户私有资产引用或调用者 URL。现有同项目 ProjectAsset 必须未退休/拒绝，属于 CURATED，登记 rights 非空；新登记与资产批准服务不在本轮。

Auth 每次验证真实 token，数据库核对当前 session / JWT 到期、独立 operator 动作、角色、归属和项目 epoch。Serializable 事务锁定当前项目、资格和资产，事务末端重新按数据库时钟检查会话与所有参与者的资格。任何一阶段撤权、epoch 漂移或自然过期都拒绝；旧回执不恢复权限。

## 对象身份与恢复

固定私有 bucket `registry-quarantine-v1` 与 `registry-candidates-v1` 不复用 P1-A 的 AssetKind、签名 URL、删除队列或用户 bucket 配置。精确 key 分别为 `q1/projectId/assetId/intentId/sourceDigest` 与 `c1/projectId/assetId/quarantineId/intentId`。这些标识由服务端随机生成，路径由身份重建；来源与候选均绑定 Storage object UUID 和 version。

每次外部写入前先在独立事务提交 `asset_object_intents`，再通过重新授权的事务写入 Storage、读回字节及追加 `asset_quarantine` / `asset_verifications`。意图不构成对象使用权。数据库失败或进程退出后，对象仍私有且意图可查；没有成功证据，也没有发布或读取能力。重试复用意图和原 key，禁止 upsert。stage 的同 actor/project/key 不同内容返回 `IDEMPOTENCY_CONFLICT`；verify 按 actor/quarantine 固定一次结果，重放仍重新核对源及候选的实际对象与当前权限。

无自动补偿删除。未完成意图可能对应缺失、部分写入或已完整写入的对象。当前只支持相同请求的安全重试；坏代际、策略变更或撤权后的意图保留用于运维核对，不自动重绑、覆盖或清除。独立垃圾回收、资源配额和运维恢复流程仍须后续实现。

Quarantine 在 Release 之前建立，因此身份先绑定项目、资产、对象代际、摘要和策略。未来 delivery 必须通过另一份不可变授权额外绑定具体 Release、净化对象及所有策略版本；不能把本轮候选或字节证据直接接到现有发布命令。

## 实际字节、净化与扫描

实际 Storage GET 禁止重定向和缓存，五秒网络期限，按流累计最多 2 MiB，验证真实长度及 SHA-256。对象元数据、HTTP MIME 和登记信息同时一致仍不足以通过：Markdown 必须严格 UTF-8、无二进制控制符或 HTML 标记；图片须由 Sharp 实际解析并完整解码，验证 PNG/JPEG/WebP 格式、单帧、最多 1600 万像素、三秒处理期限，再重新编码为 PNG 并丢弃容器元数据。规范化候选重新上传并读回验证摘要、大小、MIME 和对象代际。

当前 `QUARANTINE_POLICY_REVISION=1`、`SANITIZER_REVISION=candidate-normalization-v1`、`SCANNER_REVISION=unavailable-v1`。Markdown 仅规范换行与 NFC；这不是完整 Markdown 安全渲染、恶意软件扫描、敏感内容或权利审核。图片重编码也不等于安全批准。因此数据库只允许 `BLOCKED`，没有 PASS 开关，也不写 deliveryDigest、不推进 ProjectAsset 至 VALIDATED/APPROVED。

每次复核比较源摘要、MIME、大小、rights/provenance 指纹、scanRevision、项目 epoch 和策略版本。策略升级需协调前向迁移与应用版本，并重新建立来源/验证事实；不得修改旧证据或以旧扫描记录缓存授权。将来扫描器接入须增加可信 worker 身份、引擎/规则集版本、期限、失败与超时默认拒绝，以及净化策略和证据的独立审批。

## 存储授权边界

三张 private 表启用 RLS，撤销 PUBLIC/anon/authenticated/service_role 的全部表权限，无客户端 policy；辅助函数固定 search_path 并撤销公开 EXECUTE。Registry bucket 永远 private，受大小与 MIME 限制。restrictive Storage policy 即使面对宽松 permissive policy 也拒绝客户端对 Registry bucket 的读、列举、写、签名等操作；用户私有 bucket 的既有授权不变。

SQL guard 拒绝 Registry 对象替换、移动、改元数据或代际，允许访问时间更新；删除后重新创建会得到不同 UUID/version并被验证拒绝。服务角色仍是项目级可信 Storage writer，数据库 owner 和底层存储管理员仍在信任边界内；隔离是独立命名空间、ACL 和协议，不宣称已部署独立凭据或网络 origin。持久化证据不保证未来对象永远不变，任何未来分发都必须再次做当前授权与对象验证。

## 前端交接

本轮不修改 Claude 的页面、交互、组件或设计，不提供公共上传、下载、URL 或控制台 API。前端不得将 BLOCKED 显示为可发布，也不得依据旧 APPROVED 元数据生成链接。未来新增控制台接口前，另行约定授权、ETag、上传限额、CSRF、防重放、错误脱敏、任务可见性和失效通知；UI 只可引用不含路径的服务端状态。
