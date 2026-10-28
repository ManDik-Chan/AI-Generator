# 实现与调用链

## 最小持久清理记录

采用一张 `asset_deletions` 表，不引入队列服务、通用任务系统或 Project Schema。记录不可变 owner/resource/kind/scope/bucket/path，唯一 bucket/path，保留 attempts、下一次重试时间及错误码；不关联账户或资源 FK，故级联不能抹去依据。RLS 开启，PUBLIC/anon/authenticated 无表权限，只有服务端维护路径可用。

| 状态 | 含义与允许操作 |
|---|---|
| RESERVED | 上传前已登记 key；可能未上传、正在上传或已上传但未落库。不能报告删除完成；已确认上传结束的补偿可申请 PENDING |
| TRACKED | 已附着到资源记录；补偿不能直接删除，必须由所有权检查后的源记录删除事务转为 PENDING |
| PENDING | 删除已授权，等待 Storage 确认及数据库确认；失败保留源标记和意图，维护命令重试 |
| BLOCKED | 身份、路径或 bucket 不能证明；不得调用 SDK，需要人工核查 |
| COMPLETE | Storage remove 已确认，清理确认及已标记源记录删除在同一事务提交；重复投递无操作，key 永不复用 |

完成对象清理不等于父 ToolRun 历史记录也已删除。父记录删除失败返回失败；记录仍在，可按原 run ID 再试。已完成任务保留，不因响应丢失重新开放 key。

旧顺序是 `cleanupToolRunAssets` 吞异常 → 删除 ToolRun → FK 删除 ToolAsset → 返回成功。现在是可信身份 → 锁定 owner/run 或 image → 校验完整对象身份 → 同事务标记源不可读并持久化 PENDING → 锁定清理任务 → Storage remove → 同事务 COMPLETE 与源记录删除 → 删除父记录 → 返回成功。任一故障都不能走成功响应。

Storage 成功但数据库确认/源记录删除失败时，事务回滚保留先前 PENDING；重试删除同一个不可复用 key。网络结果未知、进程退出和重复投递使用同一依据。账户/父记录直接级联时，BEFORE DELETE 触发器保留任务，合法 TRACKED 转 PENDING，损坏引用隔离为 BLOCKED。

## 高权限入口清单

| 入口 | 身份/归属与实际删除路径 |
|---|---|
| `features/tools/actions.ts`、`app/api/tools/runs/[runId]/route.ts` | requireUser / Supabase getUser；owner/run → `cleanupToolRunAssets` / `cleanupToolGeneratedImageForRun` |
| `app/api/generated-images/[generatedImageId]/route.ts` | requireAvatarApiUser；owner/image/kind → avatar 或 generated-image 服务 |
| `features/persona/avatar-service.ts` | 已认证 caller 的 userId；源 image 与当前 avatar 引用检查；生成失败补偿仅可消费已存在的 RESERVED |
| `features/tools/image-generation/service.ts` | owner/run 在生成流程反复检查；删除使用 owner/image；保存失败补偿不能删除已经 TRACKED 的源 |
| `app/api/tools/image/run/route.ts` | getUser；上传所属 run 验证；保存失败使用写前登记的补偿意图 |
| `scripts/cleanup-tool-assets.ts` | 受控服务端维护；只重试持久授权任务，过期资产也经同一所有权校验 |
| 三类 Storage wrapper | 全部调用 `features/storage/deletion.ts::deletePendingObjectBytes`；这是业务源码唯一 SDK `.remove()`，无公开任意 bucket/path 删除入口 |

授权不是字符串前缀：固定类型对应 bucket，精确重构完整路径，UUID owner 与资源/作用域绑定；拒绝编码、穿越、相似前缀、反斜线、查询串及错误扩展名。GeneratedImage 文件名必须等于资源 ID；旧 ToolAsset 文件名历史上独立生成，绑定完整 owner/run 与 UUID 文件名。新增 ToolAsset 采用资源 ID 作为文件名。

旧 ToolAsset 的 NULL bucket **默认拒绝**。只有运营核对历史单一 bucket 后显式配置服务端 `AI_TOOL_ASSET_LEGACY_BUCKET` 且与当前 bucket 相同，才允许绑定；多 bucket 历史不能用此开关猜测。隔离栈/CI 合成夹具明确绑定 `p1-tool-assets`，未设置任何生产变量。此配置不能代替 owner/run、路径或任务授权。

## 变更索引

| 文件组 | 内容 |
|---|---|
| `features/storage/{owned-target,deletion}.ts` | 精确对象身份、写前登记、源状态准备、任务锁、SDK 删除及重试 |
| `features/tools/image/{assets,storage}.ts` | 不吞删除失败；过期清理同一入口；上传先持久登记 |
| `features/{persona/avatar-storage,persona/avatar-service,tools/image-generation/storage,tools/image-generation/service}.ts` | 头像/图片正常删除及失败补偿覆盖；保留在用头像限制 |
| `features/generated-images/storage-target.ts` | 冻结实例与 WeakSet 签发，拷贝对象不能伪造可信目标 |
| 五个 API route 及 `features/tools/actions.ts` | 所有权检查、完成/待清理/阻断响应、待删资源停止签名/恢复；主页无改动 |
| `prisma/schema.prisma` | AssetDeletion，源删除标记、run 墓碑及 ToolAsset bucket |
| `20261028074859_asset_deletion_consistency` | 表、索引、RLS/grants、身份不可变、复合 FK、源删除与引用触发器 |
| `20261028080215_asset_deletion_cascade_retry` | 修正已有 TRACKED 级联转 PENDING；损坏引用不能晋升另一 owner 的任务 |
| `20261028081301_asset_attachment_fence` | 源附着与补偿共享任务锁，退休 key 不得附着 |
| `20261028081742_validate_asset_ownership` | 验证存量复合 FK；存在历史跨 owner 行时升级失败，禁止静默修复 |
| `tests/integration/private-asset-storage.integration.test.ts` 与 `fixtures/crash-deletion.ts` | 真实私有 Storage、身份、进程退出及故障回归 |
| 原两个 service mock 测试 | 仅补新持久化模块的 mock 适配，原断言保留；不能算作真实 DB 证据 |
| `features/storage/owned-target.test.ts`、GeneratedImage route 测试 | 恶意路径单元负例及新增状态/重试接口断言；原 route 断言保留 |
| `scripts/run-local-security-stage.mjs` | 隔离核对、三类测试 bucket、迁移校验和、RLS/grants/残留字节元数据、cleanup 模式 |
| `scripts/run-security-integration.mjs` | 套件间串行共享数据库夹具；套件内并发攻击仍实际运行，全部发现/零 skip 要求不变 |
| `supabase/config.toml`、安全工作流、`package.json` | CI 启用真实 Storage 与专用 bucket；cleanup 使用 react-server 条件可独立启动；required checks 不变 |

## API 与兼容边界

成功删除保留 `success:true`，增量提供 `state:COMPLETE`。可重试清理返回 `success:false,state:PENDING` / HTTP 503；无法证明归属返回 BLOCKED / HTTP 409，提示人工核查；普通数据库/系统失败不伪装待清理。Tool Action 普通失败为 FAILED，GeneratedImage 既有 HTTP 500 中文 message 契约原样保留。DELETE 可读取自己待删源以重试，GET 排除待删源；401/404/在用头像 409 保留。

新签名与恢复读取拒绝待删记录。先前发出的 60 秒签名及已下载字节无法追回，本轮没有宣称即时撤回缓存。此私有删除模块不得直接作为未来公开发布资产的授权协议。
