# P0 独立自查与 GO / NO-GO

> INTERNAL · DRAFT · 2026-10-28 · 固定基线与证据等级见 [索引](README.md)。本报告不代替 Owner 签署、运行测试、安全评审或医学有效性验证。

## 七项输出对照

| 路线图 §13 | 实际候选与证据 | 状态及限制 |
|---|---|---|
| 1 分支/HEAD/CI/PR/required checks | [12](12-ci-and-branch-audit.md)、evidence/ci-and-branches.json | Verified：23分支、25PR、53runs及规则；逐项保留历史/重跑/漏测边界 |
| 2 路由/服务/依赖/模型/边界/复用 | [01](01-source-audit.md)、[02](02-architecture.md)、source-inventory | Verified源码；目标组件是Inferred提案，不混为已实现 |
| 3 Landing/旧规范冲突/不可变约束 | [视觉](design/platform-visual-contract.md)、[动效](design/landing-motion-invariants.md)、10文件hash | Verified源码；无新golden截图/视频/Owner签署，真实视觉Gate未通过 |
| 4 ERD/AuthZ/Manifest/OpenAPI/Presentation | [03](03-permission-matrix.md)、[05](05-data-model.md)、[06](06-project-manifest.schema.json)、[07](07-api-contract.openapi.yaml)、[08](08-presentation-schema.md) | DRAFT/Proposed；文档校验不是应用实现；API浏览器认证桥、下载/多段上传尚未冻结 |
| 5 CTMR四级能力核验 | [09](09-ctmr-reference-adapter.md)、ctmr-capability-evidence | Verified固定源码/树；没有运行权重、GPU/患者数据或复现精度 |
| 6 分PR范围/迁移/回滚/测试/审批 | [10](10-release-and-test-gates.md)、[11](11-decisions-and-open-questions.md) | 提案已具体化，尚无后续PR或Owner代签 |
| 7 GO/NO-GO与阻断项 | 本文及README | P0候选可审阅；P1实装/生产/真实推理/BYOK开放均未批准 |

## 独立契约审查

另一个审查代理读取契约后指出5项具体缺口，主代理已修订并由该代理复查为PASS（只证明草案一致性）：

1. UUID与slug混用 → API/Manifest/Presentation的projectId统一UUID，另列slug。
2. 只能传资产ID → 加parameters与不可变能力input/output Schema、operationId映射，保留非AI通用性。
3. 多文件无封存时机 → READY/UPLOAD分支与显式inputs/finalize；逐资产扫描不自动派发。
4. 耐久模型不含选择快照 → RunInput、parameters/execution/inputSetHash/inputsSealedAt及版本化capabilityContracts入逻辑模型。
5. 回调sequence未持久 → Run.lastCallbackSequence与Receipt的attempt/fence/sequence/唯一约束/CAS。

复查另建议：finalize在授权后先查询幂等记录，重放同key/hash不再执行首次PENDING前置条件；已补说明，避免响应丢失后合法重试被误拒。所有修订仅发生于文档/机器草案，没有实施业务代码。

另一名负责CI取证的审查代理再次对照README/10/11/13与源码、安全、视觉和CTMR报告，结论为无阻断级跨文档矛盾。其建议把P4 Gate措辞收紧为“受控远程/GPU执行”已采纳；完成Gate也不开放任意第三方代码。独立代理审查仍不是人类Owner审批。

## 本轮验证与未执行项

**Verified（本轮实际执行）**：两个JSON Schema metaschema、OpenAPI3.2.1（20路径/21操作）、42个结构正反例及Markdown本地链接全部PASS；618个原有Git blob零差异，新增文件全部位于docs/platform。机器结果保存在 `evidence/contract-validation.json`。校验脚本不导入应用、不连接DB或外部服务。fixture名明确CONTRACT FIXTURE，无模拟实验结果或真实项目计数。

**没有本地重跑** lint/typecheck/unit/build/prisma validate/test:rls/integration/E2E；没有使用用户环境文件或生产数据库。本轮已读取的既有CI日志是真实历史执行，详细通过数/skip/执行SHA见12，不能改称本轮全套通过。尚无针对新平台实体的安全测试，因为它们尚未实现。

## 阻断清单（不得用文档完成替代）

| ID | 事实等级 | 阻断 | 解除证据 / 责任 |
|---|---|---|---|
| B01 | Unverified approval | P0冻结、P1实施 | Owner对候选明确APPROVED/CHANGES_REQUESTED；数据/权限决定逐项签署 |
| B02 | Verified源码风险 / Unverified视觉 | P1视觉基线 | Claude无JS/低动态/菜单验证与补救PR，7宽度/语言/触屏/键盘截图录屏，Owner签golden |
| B03 | Verified CI gap | 完整回归/后续安全宣称 | 独立PR使memory-verification真实集成进入隔离CI，记录skip；Node24不稳定性另查，不能冒称永久修复 |
| B04 | Verified源码 / Inferred清理风险 | P2资源删除 | Storage失败故障注入；tombstone/deletion job有可恢复依据与告警 |
| B05 | Verified缺耐久执行 | P4长任务 | 队列Spike、lease/fence/checkpoint/outbox与kill/retry/replay/对账实测 |
| B06 | Verified不存在新授权/Vault控制 | P2/P5 | 新模型与AuthZ/JWT直测；KMS/撤销/轮换/子调用/费用/秘密跨边界测试 |
| B07 | Verified CTMR包/API缺口 | P6真实推理 | 作者补可追踪模型包/环境/无UI接口/合成数据复现，真实与模拟分支明确；医学评估另验收 |
| B08 | Unverified许可/数据治理 | CTMR公开内容/医学资料 | 作者资产清单许可、合成/去标识审查；真实患者默认禁止；内部报告公开前脱敏 |
| B09 | Unverified实际环境 | Production Ready | 获准负责人提供固定部署SHA、migration/grants/RLS/storage/备份/回滚与真实smoke；本轮不操作 |

## 最终决策建议

**GO：提交P0候选供Owner审阅、继续内部RFC与合成测试设计。** 这是允许审阅具体成果的建议，不是Owner已批准的事实。

**NO-GO：自动进入P1实现、公开内部资料、任意第三方运行、CTMR真实远程推理、BYOK开放、真实医学上传、合并或Production部署。** 对应控制与验收尚缺。下一步的具体文件、回滚与Gate已列于10，无需把本轮未授权的实施混入文档交付。
