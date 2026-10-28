# R01–R11 整改追踪矩阵

问题编号与原文以 [独立复核](inputs/AIG_P0_Independent_Review.md) 为准。风险等级沿用该报告，影响范围不是已复现漏洞声明。下列测试名指 validation.json 中离线参考用例，任何 SPEC-RESOLVED 都不代表应用已实施。

| ID / 风险 | 原问题、证据与涉及模块 | 本轮技术决策及契约变化 | 验收与当前状态 |
|---|---|---|---|
| R01 高 / P1资产 | P0 08 assetId 无对应非Run读取；05只有RunArtifact；07读取为OWNER_ONLY Run路径。新Registry/Docs/Storage | 新 ProjectAsset、ReleaseAsset映射及独立资产origin GET/HEAD；授权/净化hash/来源/撤回，禁止旧ToolAsset/源bucket回退；见 assets.md | `semantic/cross-project-asset`、`asset-read/*`验证参考拒绝规则。**SPEC-RESOLVED，运行OPEN**：真实Storage策略、CDN绕过、撤回并发尚未测试；P1开放阻断 |
| R02 高 / 范围发布 | P0 00/10首切片有草稿审核，07仅项目GET，完整发布放P3。新Project服务 | 内部资格+项目角色的管理命令，外部仅GET；Draft→审核→封存Version→Release；幂等与If-Match。OpenAPI覆盖全部内部动作，无自助注册 | API public-read-only/internal-security、state拒绝直接发布；**SPEC-RESOLVED，Owner范围PENDING**；真实事务/幂等/并发在P1完成 |
| R03 中 / 草稿DTO | P0 03允许成员草稿读，07 Version强制publishedAt；生成器Version定义。新DTO层 | 内部专用DraftDTO，无publishedAt；Version可已批准未发布，Release才必须发布时间。无外部HTTP preview | `structure/draft-without-publishedAt`与fake-publishedAt；projection白名单。**SPEC-RESOLVED**；真实路由不读Draft需P1验收 |
| R04 高 / CI | package.json三套integration，security workflow94–95仅两套、104又exclude全部。现有Memory verification | 本轮不允许改workflow；登记独立CI修复任务：统一完整发现/执行列表，缺环境/意外skip fail。保留六required contexts | 当前远端同SHA最后成功仍不覆盖verification；**OPEN，非文字关闭**。flag关闭开发可申请；完整回归/对外开放前阻断 |
| R05 高 / 视觉 | P0 design无绑定SHA截图视频；is-loading、reduce和menu焦点有静态风险。features/landing | 真实源码hash/参数/断点交接，旧Lumen仅Workspace历史；不修改首页。正常golden先采，再另行批准退化修复 | **OPEN**：浏览器禁用约束和golden缺失；无视觉通过声明。P1 UI集成前必须有批准素材与行为验收 |
| R06 高 / 旧隐私 | assets.ts catch return；actions.ts后续删父；Prisma ToolAsset Cascade | 旧链路保留现状并明确缺陷；新Project资产要求tombstone/持久重试依据，不复用此删除链；另列独立修复PR | **OPEN（既有缺陷）**：Storage/DB失败/重复/并发删除故障注入未执行；不得宣称旧隐私安全。无数据依赖的纯展示P1可分离，资源治理前阻断 |
| R07 高 / 耐久执行 | P0 02/05 Outbox lease只是设计，旧Promise非耐久；既有Agent/Generation | P1无Job依赖；P4前必须完成真实队列spike、kill窗口、fence、重复副作用和费用对账；无24h恢复SLA承诺 | **DEFERRED-OPEN/P4**，不是已消除风险；不阻断无执行P1，执行持续NO-GO |
| R08 高 / 路由语义 | P0 ExecutionSelection PLATFORM/BYOK混合计算与Key来源；未来Job/Gateway | 计算 endpoint revision 与 NONE/PLATFORM_PROVIDER/USER_CREDENTIAL 正交；算法可NONE；不靠增加REMOTE枚举蒙混；冻结版本与出站，无隐式Key | **SPEC-RESOLVED，P4 OPEN**：未来封存选择Schema正反例通过（非真实路由服务）；P1 paths不含jobs/credentials/proxy；实际授权/出站/执行未验证 |
| R09 高 / 子委派预算 | P0 CredentialGrant缺子调用上限、SESSION volatile绑定；未来Vault | 初版排除SESSION；未来票据subject/version/capability/audience/nonce/expiry/model/原子预算；费用未知拒绝，不向第三方给Key | **DEFERRED-OPEN/P5**：KMS、真实泄密/撤销/费用/子调用测试未执行；不阻断P1，BYOK NO-GO |
| R10 高 / CTMR真实性 | P0 09：真实LightM路径与画圆模拟并存；LFS指针、模型元数据/检测权重缺；无HTTP证据 | 通用ResearchClaim分SOURCE_IMPLEMENTED/DOCUMENTED/EXPERIMENT_VERIFIED/PLANNED；无实测不得展示指标；现有PLY无默认授权；P1只审定文字/栅格预览 | `structure/research-reference-representable`、`semantic/unbacked-experiment`；**表达SPEC-RESOLVED，模型/资产OPEN**。未拉权重/运行/GPU/公开CTMR内容 |
| R11 中 / 语义与上传 | P0 08语义仅声明；42结构例接受重复section/SHOWCASE shell；07通用multipart不闭环，BASE_REPO硬编码 | 增离线参考语义层（重复ID/项目版本/证据/来源授权/阶段白名单/审核摘要）；P1拒3D/Embed/Remote，single-object≤2MiB；分块P4；校验器参数化、P0只执行只读prefix | 新结构/语义测试真实执行，P0 42原例不改不删。**SPEC-RESOLVED，真实sanitizer/上传/发布实现OPEN**；multipart未实现且明确排除 |

没有任何一项仅凭新增文字被标为“生产已关闭”。规范层候选可请求冻结；应用/安全/视觉风险按实际证据继续开放。
