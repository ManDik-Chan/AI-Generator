# AIG Platform P0 独立复核报告

日期：2026-10-28（Asia/Singapore）｜内部审阅资料｜独立结论，不代 Owner 审批

**判定：P0 可作为审阅候选，需修改后冻结；P0.5 收敛工作 GO；P1 当前 NO-GO。完成本文限定门禁后，可单独批准 P1 Registry + 只读 Showcase。远程执行、BYOK、CTMR 真实推理和生产发布继续 NO-GO。**

## 审阅范围与证据

读取上传 ZIP 的完整文档、机器契约、生成器、校验器和证据文件。上传文件由原会话附件映射到本机临时目录；SHA-256 为 `4ead366cf393817aa325a524ed3df986851dfdc29433b07581b5d5410f9c1637`。Windows 环境不存在请求中的 `/mnt/data` 路径，实际使用同名上传附件，未以本地另一个 ZIP 代替。

AIG 固定基线：main `e33ac216bdcffc44d12d4b7315e0d6cc48decf5c`，tree `8372e935e331688d6007b3433849c8efa8f6d10e`。CTMR 固定 commit：`ddb510499a690c286ca607dc876d757c62662813`。本结论适用于这些固定版本，不声称重新核验远程最新 main、当前 ruleset 或生产环境。

交叉核查依据包括原会话中平台规划与自查摘要，以及审计包对路线图 §13.1 的逐项对照。**原始 Development Roadmap v1.0 全文及其自查文件未包含在 ZIP 或本次可读取附件中，因此不能声称完成原规划逐字逐条的无遗漏核对。** 已确认的方向一致性包括 Project 一级实体、保留现有 Landing、兼容旧 AI 能力、独立 Private/BYOK、通用 CTMR Adapter、Codex 工程与 Claude 视觉分工。

独立实际执行结果见 [校验记录](independent-validation.json)：

- 两份 JSON Schema metaschema 和 OpenAPI 3.2.1 规范验证通过，20 路径、21 操作。
- 原校验器中 42 个结构正反例重新通过；只执行校验部分，没有执行其重写 fixtures/证据文件的部分。
- 另加 4 项探针，确认草稿 DTO 无法表示未发布版本、执行选择无独立 Remote 语义；重复 section ID 和 SHOWCASE 执行能力可通过结构验证，必须由语义层拒绝。
- 对本地固定审计源码快照重新比较 PR25 的只读 Git blob：618 文件、0 差异。这验证本地快照与基准，不证明用户其他 checkout 或远程仓库的当前状态。
- 直接复读固定快照中删除控制流和 CI workflow，确认 Storage 错误返回后仍删除父记录，以及 memory-verification 集成漏跑。未运行应用、数据库、浏览器、GPU、Provider 或生产测试。

OpenAPI 3.2.1 是已发布规范，不能把版本号本身误报为错误；但规范校验通过不证明目标生成器支持。[官方规范](https://spec.openapis.org/oas/v3.2.1.html)。Supabase 的对象 GRANT 与行级 RLS 是两层控制，二者均不能代替高权限服务端的资源授权。[官方安全文档](https://supabase.com/docs/guides/api/securing-your-api)。

## 架构判断

总体方向成立，适合增量开发。保留 Supabase 身份、既有 owner 数据隔离与账本，不重写 Chat/Memory/Agents；新项目使用不可变发布快照。公开展示、项目访问、执行能力、用户资源、凭据五个边界拆开是正确设计。UNLISTED 允许持链接访问，不能作为 Private 使用。

主要问题是从设计文字到可开发契约仍有断点。P0 报告主动标注了多数未知项，不能将“尚未实现”都当成审计缺陷；下表区分新发现的契约断点与已经报告但尚未关闭的风险。

## 问题清单

严重度描述风险，不等同于当前已复现漏洞；阻断阶段决定何时必须解决。

| ID | 等级／来源 | 证据与问题 | 影响及关闭条件 | 阻断 |
|---|---|---|---|---|
| R01 | 高／新增 | `08-presentation.schema.json` 的 DOCS/VIEWER/指标使用 assetId；`05` 只定义关联 Run 的 RunArtifact；`07` 唯一资产读取挂在 `/runs/{runId}/artifacts/{artifactId}`，且 OWNER_ONLY、P4 | P1 无 Run 却要读审核静态资产，缺实体和读取契约。定义独立 PublishedAsset 或版本资产映射、provenance、许可、内容类型、访问控制、下架和缓存撤回；Private 资产不得借公开 UUID 读出 | P1 契约冻结 |
| R02 | 高／新增 | `00` 首切片包含开发者建 Draft、审核、发布；`10` P1 建 Registry；`07` `/projects` 仅 GET，21 操作无注册/编辑/审核/发布；完整发布又安排 P3 | 明确 P1 是“受控内部导入 + 只读浏览”，还是含开发者写入。本报告推荐前者；补内部导入/发布命令、权限、版本冲突、审核与审计契约，不得为了交付偷偷加无鉴权写接口 | P1 范围冻结 |
| R03 | 中／新增 | `03` 允许成员读 Draft；`07` Version DTO 强制 publishedAt，未提供 Draft DTO；生成器第19行同样如此 | 已授权草稿没有可用响应表示。P1 默认只暴露已发布版本，未发布统一不开放 HTTP；若要预览则补独立 Draft DTO、状态和权限。用正反例证明不返回伪造发布时间 | 相应预览接口实施前 |
| R04 | 高／已登记并复核 | `12` CI-GAP-01；workflow 只列 usage-ledger / memory-proposals，之后排除所有 integration | 修复为统一完整集成入口；新增套件应自动进入门禁；缺环境与意外 skip 失败，保留有理由的设备 skip。不能将836单元通过写成集成全通过 | P1 完整回归验收 |
| R05 | 高／已登记 | 两份 design 文档均无绑定 SHA 的 golden；无JS遮罩、低动态持续变换、菜单焦点仍待实测 | 当前源码 hash 可作为采集起点，不能替代画面。先采原始 normal 基线，再单独修退化／焦点，记录有意差异；保留用户认可的设计语言、Hero与章节时序 | P1 UI 集成验收 |
| R06 | 高／已登记并复核 | `01` §4；`assets.ts` catch 返回，`actions.ts` 继续删 ToolRun；ToolAsset 级联删除 | Storage 失败可能丢失清理依据。独立修复记录可重试删除清单／tombstone，故障注入后仍可清理。属于既有隐私风险；纯展示切片不必等全平台删除系统，但不得宣称旧删除链路已安全验收 | 资源治理上线；建议优先独立修 |
| R07 | 高／已登记 | `02/05` 有 Outbox/lease/fence 设计，但无运行 Spike；原后台仍为 Promise 生命周期 | 只读 Showcase 不依赖队列。受控运行前必须实测提交/投递/Provider完成各窗口 kill、旧worker回写、重复投递、撤销和未知计费对账。24h扫描是恢复机制，不是已证明的恢复SLA | P4 |
| R08 | 高／新增澄清 | `07` ExecutionSelection 只有 PLATFORM/BYOK；文字把 PLATFORM 解释为平台Key，而 CTMR 本地GPU/普通算法不必调用Provider | 现契约缺“计算目的地”与“凭据来源”的清晰分离。冻结 endpoint revision 与 compute mode，独立选择 provider/credential；或正式定义 PLATFORM 包含无Provider远程计算并禁止隐含平台Key调用。不要凭本报告探针新增 REMOTE 枚举即算修复 | P4／CTMR Runner |
| R09 | 高／设计未闭环 | `02/03/05` 正确要求网关解密、逐step授权、预算；CredentialGrant/Scope 仍无明确Provider费用上限/子调用委派协议；SESSION的持久模型未列mode/expiry/volatile绑定 | P5前冻结受限网关票据的主体、版本、能力、audience、nonce、有效期、可调用模型与预算原子扣减；拒绝第三方自由选择替代用户调用。Provider费用估算未知时拒绝或明确批准上限策略。会话模式先不纳入首版，避免伪耐久承诺 | P5；不阻断P1 |
| R10 | 高／已登记 | `09` 真实LightM调用与画圆mask分支并存；checkpoint是LFS指针，加载目录缺dataset/plans，检测权重未提供；无已证实HTTP API | 不得将“有推理源码”写成“模型可用”。作者提供可信包和许可；干净环境无UI入口、合成几何和产物校验后再开发真实Adapter。现有PLY不能默认当合成公开素材 | CTMR真实推理／内容公开 |
| R11 | 中／新增 | `08` 声明语义校验，但42用例只验证结构；本次重复section ID与SHOWCASE system.shell均被接受。`07` multipart仅通用uploadUrl，无分片获取/完成失败恢复闭环 | 保留结构Schema的职责，另外实现并测试发布语义层，不把这些探针通过误报为已存在执行漏洞。P1拒绝未支持mode/viewer/能力；multipart明确延后或补协议。校验器BASE_REPO硬编码，也需参数化分离结构与源码复核 | P1语义层；multipart在P4 |

此外：Node24字体首跑失败、同SHA重跑成功只支持“不稳定性仍待查”，不支持“根因已修”；它不是当前Node22纯展示开发的独立阻断项。当前 GitHub required review count=0 是包内历史证据，Owner签署属于额外流程，模型不得代签。生产迁移、Storage policy和真实Provider仍未验收。

## 分阶段准入判定

| 工作 | 当前判定 | 解除条件 |
|---|---|---|
| P0 候选内部审阅 | GO | 保留证据等级和内部边界 |
| 整包作为正式冻结契约 | NO-GO | R01/R02/R03范围处置、P1语义契约与Owner签署 |
| P0.5 文档收敛、测试设计、视觉基线采集 | GO（审查建议） | 本轮只交付任务书；实施另行授权 |
| P0.5 代码修复 | 尚未执行 | 按任务书分别授权、独立PR验收 |
| P1 只读Registry/Showcase开发 | 当前NO-GO，可有条件单独GO | P0.5必要契约和范围批准；允许先flag关闭开发，隔离测试随实现完成；UI集成前有golden |
| P1对外开放 | NO-GO | 新授权双路径测试、公开资产与缓存撤回、兼容回归、UI验收、固定部署证据、发布批准 |
| 远程／GPU运行、BYOK、CTMR真实推理 | NO-GO | 分别完成P4/P5/CTMR门禁；不能由P1批准自动解锁 |
| 真实医学上传、生产迁移或部署 | NO-GO | 另行批准与对应真实环境／数据治理验收 |

不要把“最小Project隔离测试已通过”设为写第一行业务代码之前的前置条件：先批准契约和隔离测试计划，再在flag关闭的实现中完成测试，最后判断开放。这消除原阶段表可能引起的循环依赖。

## 必须现在解决与可以延后

P1必须解决：注册/发布范围、公开素材闭环、公开/私有读取语义、版本DTO、阶段能力白名单、CI漏测处置、视觉基线、兼容边界、Owner限定批准。

可延后：完整成员邀请、Installation/Grant、跨服务导出删除、任意开发者协议、Remote Endpoint、队列实现、KMS/BYOK、三维医学Viewer、CTMR模型运行、SDK与计费。延后不取消现有隐私缺陷的独立整改责任。

具体分工、输入输出、依赖、测试和回滚见 [P0.5/P1 可执行任务书](AIG_P05_P1_Taskbook.md)。本轮仅在当前聊天的 work/outputs 写审阅产物，未修改现有仓库、数据库、远程设置或主页。
