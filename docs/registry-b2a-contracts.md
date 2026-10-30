# P1-B2-A Registry：DTO、语义校验与内容哈希

实现基线为 `main@6a92061`（含 P1-B1 / PR #29）。本模块仅提供内部 Draft / Review / Version 协议所需契约与确定性内容哈希；不创建公开入口、发布命令或持久运行服务，不修改 Demo、现有 Manifest 版本、前端或既有迁移。

## 数据形状与边界

`features/registry/contracts.ts` 导出以下严格 zod schema，所有对象层级均拒绝未知字段，不做静默 strip 或类型 coercion：

| Schema / Type | 必需字段 |
| --- | --- |
| `manifestSchema` | 现有 Manifest `0.5.0`：`schemaVersion, projectId, slug, version, name, summary, category, visibility, integration, capabilities, researchClaims` |
| `presentationSchema` | `schemaVersion, projectId, version, title, sections`；MARKDOWN / IMAGE / BENCHMARKS 三类 section |
| `documentationSchema` | `id, title, language, assetId`；language 为 zh/en |
| `draftPayloadSchema` / `DraftPayload` | `manifest, presentation, documentation` |
| `draftDTOSchema` / `DraftDTO` | `id, projectId, revision, state, payload` |
| `versionDTOSchema` / `VersionDTO` | `id, projectId, version, snapshot, contentHash, hashAlgorithm, reviewId, createdAt` |
| `releaseDTOSchema` / `ReleaseDTO` | 未来白名单：`schemaVersion, projectId, releaseId, version, name, summary, visibility, publishedAt, presentation, documentation, researchClaims` |

Draft 使用 `id`，不使用 `draftId` 别名。Draft/Version 不含 `publishedAt`；Release 必须包含合法时间且仅允许 PUBLIC/UNLISTED。ReleaseDTO 在 B2-A 只作为边界 schema 与测试，不提供构建器、发布命令、数据库 public projection 或 HTTP 路由。

Manifest 直接复用现有枚举与 `0.5.0` 版本常量：只接受 `SHOWCASE` 与 `documentation.read` / `presentation.read` / `static-image.read`。`aig.capability/0.1`、`aig.worker/1` 与 Run Lifecycle 仍由原 Demo 实现，不作为 Manifest 的额外执行权限。本模块没有把第三方执行、远程 URL、credential 或 BYOK 字段放入快照。

所有 DTO 会拒绝 owner/ownerId、credential、storageRef、apiKey 及其他未知结构字段，包括嵌套 integration、claim、section、metric、documentation。自由文本仍可能由提交者写入敏感内容；结构校验不声称能自动识别文本机密、净化 Markdown、验证著作权或证明科研结论。

## 校验调用与语义

```ts
const payload = validateDraftPayload(input, { projectId: lockedProject.id, slug: lockedProject.slug });
const references = collectAssetReferences(payload);
// Command transaction resolves every reference against current same-project approved assets.
const contentHash = hashSnapshot(payload);
```

- `parseDraftPayload(input)` 接受原始 JSON text 或 JSON 值；text 先经过严格解析，再检查纯 JSON / Unicode / 大小及 schema。
- `validateDraftPayload(input, {projectId, slug})` 进一步绑定已锁定项目；context 来自服务端数据库，不采纳调用方伪造的 owner。
- Manifest、Presentation、DraftDTO/VersionDTO 的 projectId 必须一致；Manifest/Presentation/VersionDTO 的 version 必须一致。版本采用无 prerelease/build 的 `MAJOR.MINOR.PATCH`，revision 是正的 PostgreSQL int 范围。
- section id、documentation id / assetId、同一引用数组的资产 ID 不得重复（UUID 大小写别名亦拒绝）；数组上限沿用历史 P0.5 契约。
- `EXPERIMENT_VERIFIED` claim 必须带证据，`REPORTED` metric 必须包含数值、协议/数据集/模型版本及 evidenceAssetId；`UNPUBLISHED` 不接受伪造结果字段。
- `collectAssetReferences(payload)` 返回 `{id, usage:'markdown'|'image'|'evidence'}[]`，覆盖 documentation、researchClaims、MARKDOWN sourceAssetIds、IMAGE 和 REPORTED metrics。`collectReferencedAssetIds` 返回去重排序 ID。
- 同一批准资产可被多个 section/claim 引用；不能因重复引用而丢失 usage 检查。服务端必须在当前事务中验证每个引用的同项目归属、APPROVED 状态、用途对应 MIME、deliveryDigest 与授权新鲜性，并将稳定 digest set 单独绑定 review。结构校验不是资产授权检查。
- VersionDTO 除了校验 hash 形状与 `JCS-SHA256-v1` 标记，还计算 snapshot 的真实内容哈希并比较；不接受 hash 与内容不符的已封存 DTO。

B1 创建函数产生空 `{}` Manifest/Presentation，是尚未初始化的内部存储记录，不是有效 DraftDTO。`getRegistryDraftHead` 只返回 id/projectId/revision/state 与 ETag，可用于首次编辑；`getRegistryDraft` 在尚未初始化时返回 `DRAFT_UNINITIALIZED`。B2-A 必须先经过首次合法编辑才能作为完整 DraftDTO 读取/提交，不得补造 schema 字段或把空行当作已校验内容。

## JCS 字节定义

`features/registry/canonical.ts` 导出 `parseStrictJson`, `canonicalize`, `canonicalHash`, `hashSnapshot`, `HASH_ALGORITHM`。定义为：

```text
contentHash = lowercaseHex(SHA256(UTF8(RFC8785(DraftPayload))))
hashAlgorithm = JCS-SHA256-v1
```

哈希对象只包括 payload 的 manifest/presentation/documentation；DTO 外层的 id/revision/state/createdAt、Review actor/epoch/policy/expiry 和 assetDigestSet 不塞进 contentHash。它们由审核协议分别固定和复检，不能用内容相等替代授权有效。

依据 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) 与 [I-JSON RFC 7493](https://www.rfc-editor.org/rfc/rfc7493.html)，实现：

- 对解码后的对象 key 检测重复，包含 `"a"` 与 `"\u0061"` 别名；拒绝 trailing content、非法 JSON、非有限数。
- 所有 key/string 拒绝 lone surrogate 和 Unicode noncharacter；不归一化 Unicode、不静默替换字符。JSON 文本入口是 JavaScript string；未来 HTTP 接口还须使用严格 UTF-8 字节解码，不能先用宽松 decoder 替换非法字节。
- 数字使用 ECMAScript / V8 的有限 IEEE-754 binary64 序列化，包括负零、指数边界、最小 subnormal、round-to-even。JSON 原文的 decimal 在解析时按 binary64 舍入，不承诺任意精度；精确大整数应设计为字符串而不是塞入指标 number。
- 递归按 UTF-16 code unit 排序对象原始 key，不依赖 locale；数组保留顺序。手工输出排序后的属性，避免普通对象的整数 key 被 JSON.stringify 重排。
- 输出无额外空白、UTF-8 编码；只对 primitive 使用 JSON.stringify，不调用调用方的 toJSON，不接受 Date/BigInt/undefined/function/accessor/symbol/hidden property/稀疏数组/非纯对象或循环。
- 原文及 canonical 输出上限 256 KiB、嵌套深度 64。资产上传大小不由此常量定义。

## 固定向量与跨语言验证

`tests/fixtures/registry-jcs-vectors.json` 包含 RFC §3.2.2–3.2.4 完整 UTF-8 / 排序样例、Appendix B 的全部 26 个 binary64 样例（含 NaN/Infinity 拒绝）、数字 key / 递归 / Unicode 保留案例及一个实际 0.5.0 DraftPayload 快照。每个完整 JSON 样例固定 canonical 字符串与 SHA-256，不能在测试中从待测 canonicalizer 动态生成期望值。

TypeScript 定向验证：

```text
pnpm exec vitest run features/registry/canonical.test.ts features/registry/contracts.test.ts
```

Python 验证使用 RFC Appendix G 链接的 [cyberphone Python 参考实现](https://github.com/cyberphone/json-canonicalization/tree/32a48195b9b20fe67b1795e39e4509f14d860b45/python3)，固定 commit `32a48195b9b20fe67b1795e39e4509f14d860b45`，在独立目录准备该 checkout 后：

```bash
reference="$(mktemp -d)"
git -C "$reference" init --quiet
git -C "$reference" remote add origin https://github.com/cyberphone/json-canonicalization.git
git -C "$reference" fetch --depth=1 origin 32a48195b9b20fe67b1795e39e4509f14d860b45
git -C "$reference" -c core.hooksPath=/dev/null checkout --detach --quiet FETCH_HEAD
python3 scripts/verify-registry-jcs.py --reference-root "$reference"
```

脚本检查 reference commit 及 tracked 文件未修改，导入其 Python implementation，逐项比较 canonical bytes 和 SHA-256，另按 IEEE754 hex 构造所有官方数字样例。脚本本身不下载依赖、不读取 `.env`、不连接数据库；参考 checkout 不进入应用依赖。`json.dumps(sort_keys=True)` 的排序和数字格式不符合 RFC 8785，不能替代此验证。

`.github/workflows/merge-gates.yml` 的独立 `Registry JCS Python reference` job 每次从上述主来源 fetch 固定 SHA，使用 runner 的 Python 3，执行全部 31 个向量。缺少网络、参考 commit 不匹配或 bytes/hash 不一致都会失败，不 skip，也不调用生产凭据或数据库。它是新增检查，保留既有 quality、Node 24、authenticated Playwright 和安全门禁。

本次向量运行与命令协议的真实数据库/并发/权限验收是不同证据。最终提交的完整验收与 CI 状态由对应交付记录列出；本文件不把库单测或 Python 参考结果冒充 Review/Version 服务、发布或生产验收。
