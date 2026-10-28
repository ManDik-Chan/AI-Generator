# Manifest / Presentation / API 契约说明

> INTERNAL · DRAFT · **Inferred / Proposed**。机器草案不是已经开放的 API 或 UI 能力；Owner 冻结前不交由视觉实现。

## 文件与版本

- [Manifest Schema](06-project-manifest.schema.json)：JSON Schema 2020-12，字段白名单、版本/模式互斥、Registry reference；无任意 URL、Shell 或源码字段。
- [Presentation Schema](08-presentation.schema.json)：固定类型 section，无任意 JSX/HTML/JS import。科研和非 AI 项目使用同一结构。
- [OpenAPI](07-api-contract.openapi.yaml)：拟议 `/api/v1`；用 JSON 语法保存为 YAML（JSON 属于 YAML 兼容表示）。采用 [OpenAPI 3.2.1](https://spec.openapis.org/oas/v3.2.1.html)，当前规范版本已核对；不自动升级现有 API。

schemaVersion=1.0.0 是草案目标版本，不能与已发布稳定版混淆。未知字段拒绝，未知 schemaVersion 拒绝；版本是受限 SemVer 子集（不含 build metadata），完全 SemVer 支持留给 P3。公开生成 SDK 前冻结具体 codegen/validator 支持矩阵。

`projectId` 在API、Manifest、Presentation和数据库中统一为UUID；人类可读路径另用`slug`。这有意修订路线图示例中`projectId=ctmr-4c`的混用，不是修改现有生产协议。

## 结构校验以外的强制语义

Schema 不能证明资产存在、作者有权发布、能力安全或实验真实。服务端还必须验证：

1. projectId/版本与登录所有者、Registry、发布状态一致；Manifest 的 visibility 不能覆盖 DB 权限。
2. capability 必须在平台注册，模式/阶段支持该能力；SHOWCASE 不能申请执行权限；危险能力变更重新审核授权。Schema 允许通用名称不等于允许 `system.shell`。REMOTE_API的operations逐项绑定capability→operationId→本地input/output Schema，能力/operation必须唯一且在同一发布包OpenAPI存在；发布时保存不可变Schema快照/hash。参数在进入额度事务前按该能力inputSchema校验，输出也按固定outputSchema验收。
3. endpointRef/embedRef 映射已审核且未停用的不可变 revision；OpenAPI `servers`、远程 `$ref`、描述链接不授予出站权限；发布校验不默认访问外部 URL。规范大小、深度、引用和解压上限在 P3 实现。
4. public 资产需 provenance/许可/dataClass 审核，UUID 不是授权；只有审核资产可成为公开 Presentation 的 assetId。Markdown 即使通过 Schema 也必须禁 raw HTML、javascript/data/file URL 和跟踪资源。
5. sections.id 全局唯一；每种 viewer 是代码 allowlist 内的已有实现，缺失能力显示“未开放”而非空按钮。没有静态医学 Viewer 实现的事实不因 Schema 含 MESH3D 而改变。
6. REPORTED/REPRODUCED 必须附真实数据集、协议、证据资产；REPRODUCED 必须有独立可复现记录。未发表指标用 UNPUBLISHED 并省略数值，不填零。
7. MEDICAL_SENSITIVE 即使结构可表达也在 V1 policy 中拒绝；默认 synthetic-only。数据保留字段只是声明，必须与平台上限和处理者合同一致才可发布。

## 异步 HTTP 语义

Run 创建将 versionId、grantId、capability、输入 assetId 与明确 execution selection 绑定。`Idempotency-Key` 按 subject 全局唯一，保留提案为至少 24h，不能在去重窗口内先删 reservation；同 key+同规范化 requestHash 返回同 Run 的 202/终态视图，不重复收费；不同 hash 返回 409。服务端产生 ownerId/runId/状态。

RunRequest必须给出`parameters`（普通算法/文本参数）、`inputMode`（READY/UPLOAD）和`inputAssetIds`。parameters是有上限的JSON对象，整个创建body初步上限64KiB、嵌套深度16，能力Schema进一步限类型/长度；此为实现要求而非本轮已测试的parser。READY在创建时封存已批准资产，可为空以支持纯参数能力；UPLOAD要求初始asset列表为空，只生成PENDING Run，随后逐项上传/扫描。调用`POST /runs/{runId}/inputs/finalize`明确给出完整asset列表和Idempotency-Key，服务端校验全部owner/APPROVED/能力约束后原子封存并发ready事件；同key不同列表409。原始创建requestHash不变，另存inputSetHash。封存后禁止增删/替换输入；upload completion本身不触发派发。

错误使用 `{code,message,requestId}`；不返回 stack、Key、Provider 原始错误、signed URL 或内部连接串。匿名 Private/未授权资源读统一 404；未登录 mutation 401；当前可见但无执行能力 403；冲突409；超过额度429；过大413；功能门禁关闭503。所有有私有数据的响应 Cache-Control:no-store；Public DTO 可缓存但须把可见性下架与缓存失效作为安全路径验证。

回调另属内部接口：注册端点身份、原始 body HMAC、时间窗口、eventId、runId、attempt、fence、sequence、schema 与大小全部验证；timestamp 过期拒绝，eventId与bodyHash相同重放幂等，旧 attempt/fence拒绝。Receipt持久存sequence并以(runId,attempt,sequence)唯一，Run.lastCallbackSequence与状态原子CAS，仅接受下一序号；乱序事件409后由Adapter重发/对账，不静默跳过缺失步骤。HMAC 密钥与用户 BYOK 分离，轮换有有限重叠。mTLS/OIDC 可以替代HMAC；TLS始终是传输前提，正式认证选择与故障注入留给 P4。

## 浏览器交接

Claude 仅依已冻结 DTO 做公开/私有/未配置/未发布/无权/失败状态；不得展示静态样例为真实请求结果或把 Schema 能力当作上线能力。每项 UI 动作必须能映射对应 API 与状态机；无 API 的设计只能标注候选。P0 不向其他聊天发送交接消息。
