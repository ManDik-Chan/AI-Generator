# 机器契约与错误协议

全部为候选，未实现。`p1.openapi.json` = OpenAPI 3.1.0（JSON表示）；`manifest/presentation/draft/version/release/assetmetadata.schema.json`及`futurerouting.schema.json` = JSON Schema 2020-12。后者不列于P1 OpenAPI，只表达未来服务端封存的计算目的地与凭据来源：operationClass来自审核过的Registry，不能由调用者宣称；ALGORITHM只能NONE，PROVIDER必须明确Provider凭据选择。每step仍需真实授权、预算、出站与票据验证，Schema通过不解锁执行。`non-ai.fixture.json`、`research.fixture.json` 仅为合成结构数据；其中 rightsRef/APPROVED 是虚构测试状态，绝非真实素材许可。

生成源唯一为 `../validation/generate_contracts.py`；测试比对 OpenAPI内嵌定义与独立Schema一致。`researchClaims` 是通用声明列表，不自动变成执行能力。SOURCE_IMPLEMENTED/EXPERIMENT_VERIFIED必须有经审核证据资产；REPORTED指标必须含数据集、模型版本、协议、单位与证据；UNPUBLISHED禁止值（包括0）。不允许任意component/viewer/URL/代码。

结构通过后必须运行发布语义校验；生产实现还需真实 sanitizer、Storage、DB授权和并发事务验证。参考校验器没有假扮已上线的发布服务。

## 标识、请求与响应

API路径Project使用UUID；slug只用于未来页面 `/projects/{slug}` 的服务端解析，解析后调用同一发布读取规则，不把slug混进UUID字段。目录只列当前PUBLIC release，limit≤50；cursor是不透明签名游标，绑定筛选、排序、有效期与可见性epoch，翻页重新授权，不泄漏Unlisted/Private计数。P1无全文检索。

内部目录只列操作者当前active membership的项目；版本索引只列同项目封存Version，支持已批准未发布版本，均有界分页/no-store。Review读取只对同项目OWNER/提交者/REVIEWER/PUBLISHER开放，返回审核摘要和绑定资产ID供复核，不泄露源路径或凭据。项目列表state在archivedAt存在时为ARCHIVED，否则优先活动Draft状态，若无活动Draft而存在currentRelease则PUBLISHED。

内部bearer只证明身份，还必须实时 internal资格/角色/成员校验。无浏览器service key，不信user_metadata；内部CLI不接cookie，不开放CORS写入；如未来Console使用cookie需CSRF/Origin校验另行验收。内部写入总是 Idempotency-Key；除create外必需 If-Match（Project revision的带引号十进制ETag）。对资产/审核/草稿的动作均在项目锁内递增该revision，服务返回新ETag。

同 actor+operation+project+key 且 bodyHash一致返回原receipt；hash不一致409，重试先做当前权限核验。Draft PATCH 是完整替换DraftPayload而非JSON Merge Patch；仅DRAFT，schema严格未知字段拒绝。创建默认Private，owner由服务确定。

`submitReview` 固定candidateHash、目标visibility；常规从当前Draft生成，rollback用targetVersionId指向同Project已封存Version，发布时仍需要新审核。`startNextDraft` 从当前Version复制；只有前草稿终结后允许。`restrictVisibility` 只允许立即收紧PRIVATE并撤回全部外部release；放宽/改为Unlisted走review+publish。

上传为 registerAsset元数据→PUT单对象字节→服务器净化VALIDATED→PublicationReview批准APPROVED；状态只由服务决定，不接纳客户端APPROVED。大小上限按实际流字节强制，不能只信schema/maxLength或Content-Length。没有resume或分块能力。review拒绝时字节仍不可公开；权利更新/净化版本变更必须重新注册/审核。

内部资产content GET让有效内部成员预览本项目VALIDATED/APPROVED净化字节；不返回源文件，QUARANTINED/REJECTED/RETIRED拒绝。它与公开资产origin完全分离，不开放外部草稿preview；Private Docs也通过内部Version引用此路径读取。所有普通文字字段在UI按文本转义，只有Markdown经过独立安全AST管线，不直接innerHTML。

ReleaseDTO外部拒绝PRIVATE；内部publish返回receipt，Private内容通过内部Version/Draft路径读。Docs响应只读Version固定asset的净化Markdown，不能用documentId取Draft正文。asset独立origin GET/HEAD；Range在P1返回416。不存在任意URL代理。

| HTTP | code | 语义 |
|---|---|---|
| 400 | INVALID_REQUEST | JSON/UUID/字段格式无效、重复key |
| 401 | UNAUTHENTICATED | 内部缺有效身份 |
| 403 | FORBIDDEN | 已确认内部资源后角色不足；不暴露其他项目存在性 |
| 404 | NOT_FOUND | Private外部、跨项目、未知、已撤回、未发布统一响应 |
| 409 | CONFLICT | 版本/状态/幂等冲突 |
| 412 / 428 | PRECONDITION_FAILED / PRECONDITION_REQUIRED | revision过旧 / 缺If-Match |
| 413 / 415 / 416 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE / RANGE_NOT_SUPPORTED | 有界输入与格式限制 |
| 422 | SEMANTIC_REJECTION | 发布引用、来源、授权、阶段能力等拒绝 |
| 429 | RATE_LIMITED | 上传/写入/读流量限额；Retry-After |
| 503 | DEPENDENCY_UNAVAILABLE | DB/Storage/授权核验不可用，fail-closed |

错误只含code/message/requestId，禁止栈、源路径、Key、owner私人信息。所有响应包括404/错误/HEAD均no-store；metadata/缓存和asset复用同一权限规则。404不可附对象名。OpenAPI的错误响应集合为可用词汇，并非每个操作都会触发所有错误。

兼容：0.5.0候选不兼容旧P0包，未经批准不自动转换。未来稳定 `/api/v1` 的破坏性变更必须新主版本；未知schemaVersion失败，新增能力/资源格式不靠客户端忽略解锁。validator已实测版本见evidence；SDK/codegen支持尚未测，P1增加消费编译测试后方能宣称可生成SDK。
