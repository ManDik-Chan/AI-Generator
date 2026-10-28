# Registry / Publication / DTO 契约

逻辑模型，不是 migration。所有表新增约束必须通过独立实现与真实数据库验收。

## 实体与边界

| 实体 | 字段与生命周期 | 约束 |
|---|---|---|
| Project | id、稳定 slug、ownerId、visibility、archivedAt、currentReleaseId、authzEpoch、revision | slug 不重用；owner 服务器确定；currentRelease 必须同 project；可见性变更 epoch+1 |
| ProjectDraft | id、projectId、revision、state、manifest、presentation、documentation、updatedBy | 单项目一个活动草稿；DRAFT/IN_REVIEW/PUBLISHED/ARCHIVED；未发布没有 publishedAt；编辑只在 DRAFT |
| ProjectVersion | id、projectId、version、snapshot、contentHash、hashAlgorithm、reviewId、createdAt | 审核通过才封存；unique(projectId,version)，复合(id,projectId)；不可变，无必须 publishedAt；未发布也可有已批准 Version |
| ProjectRelease | id、projectId、versionId、visibilityAtApproval、contentHash、publishedAt、state、withdrawnAt | state=PUBLISHED/WITHDRAWN；一次成功激活才创建；撤回不篡改 Version；回滚创建新 releaseId |
| ProjectAsset | id、projectId、sourceDigest、deliveryDigest、mime、size、dataClass、storageRef、provenance、rightsRef、scanRevision、state | QUARANTINED→VALIDATED→APPROVED→RETIRED 或 REJECTED；私有源/展示字节隔离；storageRef 仅内部；复合(id,projectId) |
| ProjectDocumentation | id、projectId、draftId或versionId、title、language、assetId、contentHash | 草稿记录可改；Version 内文档引用不可变；只指同项目获准 text/markdown 资产；不可 fetch 远程内容 |
| ProjectMembership | projectId、subjectId、role、active、revision | unique(projectId,subjectId)；OWNER/EDITOR/REVIEWER/PUBLISHER/VIEWER；owner唯一；可多角色但同次审核不能自审 |
| PublicationReview | id、projectId、draftId、draftRevision、snapshotHash、visibility、assetDigestSet、submitterId、reviewerId、decision、policyRevision、expiresAt | PENDING/APPROVED/REJECTED/INVALIDATED；reviewer≠submitter，批准绑定完整字节摘要/授权来源/目标可见性；改草稿、资产净化版本、权限/政策均失效 |

不新增发布所不需的 Run、Credential、Installation、GPU 表。Review 与审计、资源清理可记录必要内部元数据，但不进入公开 DTO。

## 权限与状态

所有下列内部动作先验证 active internal资格，再检查 project role、对象归属、当前 revision 与 epoch。Owner 是项目所有权角色，不等于平台发布审核者；最终 Owner 批准 P1 是包级决策，不代替内容审核。

安全处置者在P1仍须同项目REVIEWER/PUBLISHER成员资格和另行授予的SAFETY_OPERATOR动作资格；不是Profile.ADMIN默认拥有的全项目权限，也不获得源文件或其他私有内容读取。接口角色列为动作资格，统一internal/项目范围校验始终生效。

| 动作 | 允许主体 | 前置与结果 |
|---|---|---|
| 创建 | 内部受控 creator；服务器授 OWNER | 唯一 slug，Private 默认，建立 DRAFT，不采纳 payload ownerId |
| 编辑/上传 | OWNER/EDITOR | DRAFT + If-Match；revision递增，旧 review 失效 |
| 内部读取草稿 | 任一 active member 且内部资格有效 | 独立 DraftDTO，no-store；外部无 preview 路径 |
| 提交 | OWNER/EDITOR | DRAFT→IN_REVIEW，固定 revision/hash；语义校验失败422 |
| 撤回审核 | 提交人或 OWNER | IN_REVIEW→DRAFT，review INVALIDATED；不可直接发布 |
| 审核 | REVIEWER，且不是 submitter | APPROVED 封存 Version，草稿仍 IN_REVIEW；REJECTED 返回 DRAFT |
| 发布 | PUBLISHER | 批准有效、内容未变、全部资产/文档授权有效；成功 DRAFT记录转PUBLISHED并创建 Release |
| 撤回发布 | OWNER/PUBLISHER 或有理由的安全处置者 | release WITHDRAWN；停止列表/详情/资产；审计不可删 |
| 归档项目 | OWNER | Project archivedAt，撤回所有 release，DRAFT/IN_REVIEW→ARCHIVED；禁止编辑/发布 |
| 新版本 | OWNER/EDITOR | 从旧 Version 克隆到新 DRAFT，不修改旧快照；新版本号重新审核 |
| 回滚 | PUBLISHER | 使用旧 Version 新建审核请求（同一 submit 命令 targetVersionId）；新审核通过后新 Release，绝不复活已撤回 URL |

审核批准不另造 REVIEWED 草稿状态；避免 P0 DRAFT→REVIEWED 与任务要求冲突。IN_REVIEW 冻结写入，批准后只能发布、撤回审核或归档。发布失败保留 IN_REVIEW + 已封存 Version，不填假 publishedAt；重试幂等，不重用版本号生成另一快照。

可见性独立：PRIVATE 只内部 active member 读；UNLISTED 无认证持链接可读发布投影，但不列目录、搜索、sitemap、推荐、计数、OG 预取；PUBLIC 允许发现。公开端点对 PRIVATE 无论是否带 JWT 均404。Private 内部读取依然只由内部路由承担；不存在将用户 Run 资产转公开的隐式继承。

向更公开的可见性变更必须新 review + release（目标可见性在批准摘要内）；收紧为 PRIVATE 或归档先拒绝全部外部请求，epoch 递增，旧 release 永久撤回。Unlisted→Public 同样需审核。历史版本 URL 只有该 release 仍 PUBLISHED 且项目当前外部可见才可读；current 指针变化不是撤回旧 release，回滚请求明确列出要撤回的 release。

## 发布事务与外部存储

准备阶段生成候选 Version、已净化资产 deliveryDigest 和公开白名单投影；写入独立展示存储但不可外部读取。审批绑定这些字节、可见性和资源授权。激活事务重新检查 membership/internal资格/epoch、review expiry、所有资产状态、hash与 projectId；锁 Project 行，CAS expectedRevision，原子插入 Release、关联资产映射、更新 currentReleaseId、审计及 draft state。数据库失败不得出现可见半发布；对象上传失败不执行激活事务。

不能跨数据库/存储假设原子：发布准备的孤儿对象留内部清理清单，未引用对象永不由读取层返回；存储读失败返回503，不回退到源文件或草稿。成功响应丢失时同 actor+command+Idempotency-Key、相同 bodyHash 返回原结果，不同 body409；权限仍实时复检，撤权后不回放敏感旧响应。

撤回事务先置不可读/epoch+1，随后幂等清理展示字节。对象删除失败保留 tombstone、storageRef、attempt、nextRetry、错误码；不级联丢清理依据。公开读取 fail-closed，授权存储不可用503。回滚不自动恢复被 RETIRED 的资产，须重做权利与内容审核。

## 三层数据边界

- DraftDTO：内部可编辑 manifest/presentation/documentation + revision/state；无 publishedAt；不得带 storageRef/用户内容/credential，审核内部信息单独接口。
- 数据库记录：含 owner、存储引用、审计、审核与清理元数据，永不直接序列化到外部。
- ReleaseDTO：严格白名单投影，仅项目/发布 ID、版本、标题摘要、已审核 sections/docs、publishedAt、public/unlisted可见性；来源只为不可变 Version + Release + ApprovedAsset 映射。不得 join Draft、User/ToolRun/Run、Credential，不能 fallback。

Manifest 是发布包声明，不是 ORM 行。旧 DTO 的强制 publishedAt 拆成 Version（不要求）与 Release（必须）；Draft schema 明确拒绝该字段。section/文档/指标证据引用必须闭合于获准资产集合。公开 API 不提供 source/rightsRef/reviewer 等内部字段。
