# AIG Platform · P0 审计与规范候选

> **内部资料，禁止自动公开** · 2026-10-28（Asia/Singapore） · DRAFT / DESIGN-ONLY  
> 本轮执行用户指定路线图 §13.1。仅源码审计、设计文档和文档校验；未实施 P1、修改业务/UI、建表、迁移、合并、部署或更改 required settings。

**结论：可审阅 P0 候选；进入 P1/生产开放为 NO-GO，等待 Owner 审批及相应门禁。** 文档交付不等于安全验收，Owner 状态仍为 PENDING。

## 基线与证据

- AIG `main`：`e33ac216bdcffc44d12d4b7315e0d6cc48decf5c`；tree：`8372e935e331688d6007b3433849c8efa8f6d10e`。
- Git 代理失联，远程以 GitHub connector 只读 API 取证；本地以 PR25 `a0050aa…` 的同一 tree 导出。这是与 main **内容一致的审计快照**，没有切换用户原工作分支。锁定证据见 [source-lock](evidence/source-lock.json)。
- CTMR commit：`ddb510499a690c286ca607dc876d757c62662813`；tree：`15213cbf95e62d9c37840d4fd2378798df6ec41d`。路线图把前者标作 tree 的错误已纠正。
- **Verified**：固定源码/API/真实日志直接支持；**Inferred**：推论或设计提案；**Unverified**：缺少运行、实际环境或批准证据。Verified 源码不等于运行测试通过。

## 交付索引

| 文档 | 覆盖内容 |
|---|---|
| [00 产品与范围](00-product-vision.md) | 目标、非目标、旧能力保护、旅程 |
| [01 源码审计](01-source-audit.md) | 当前路由/依赖/服务/ERD/信任边界、复用与缺口 |
| [02 目标架构](02-architecture.md) | Registry、Gateway、队列Spike、Vault与兼容边界 |
| [03 权限矩阵](03-permission-matrix.md) | 项目可见性、资源所有权、授权、Admin边界与真实JWT测试 |
| [04 威胁模型](04-security-threat-model.md) | IDOR/RLS/Secrets/SSRF/异步/医学/隐私等威胁与Gate |
| [05 逻辑模型与ERD](05-data-model.md) | 关系、约束、Run状态机、可恢复快照、删除/迁移 |
| [06 Manifest Schema](06-project-manifest.schema.json) | Showcase/Embed/Remote字段、operation/schema绑定 |
| [07 OpenAPI草案](07-api-contract.openapi.yaml) | 版本/授权/运行/封存/上传/凭据/回调提案 |
| [08 Presentation说明](08-presentation-schema.md) / [Schema](08-presentation.schema.json) | 通用展示、真实指标、可信资产、语义验证与协议行为 |
| [09 CTMR核验](09-ctmr-reference-adapter.md) | 已实现/已测试/仅声明/待开发、权重/输出/Adapter缺口 |
| [10 PR拆分与QA](10-release-and-test-gates.md) | 每PR文件范围、迁移依赖、回滚、测试与Owner关口 |
| [11 决策与审批](11-decisions-and-open-questions.md) | D01–D15、推荐候选、PENDING审批记录 |
| [12 分支/CI/门禁](12-ci-and-branch-audit.md) | 23分支、25PR、53runs、六项required checks、历史失败复核 |
| [13 自查与GO/NO-GO](13-self-audit-and-verdict.md) | 7项验收对照、阻断项、独立审查及校验边界 |
| [视觉契约](design/platform-visual-contract.md) / [运动约束](design/landing-motion-invariants.md) | 当前真实Landing、旧Lumen冲突、golden及退化验收 |
| [校验复现](validation/README.md) | 文档校验、结构fixtures、原始源码一致性检查 |

## 首要阻断项

**本轮文档校验 Verified**：2份Schema、OpenAPI3.2.1及42结构正反例通过；618个原有Git blob零差异。此结果不覆盖应用、安全或视觉运行测试，详见 `evidence/contract-validation.json`。

1. Owner 未签架构/权限/API/数据策略；Landing 的绑定SHA截图与录屏golden尚未归档。
2. CI漏跑 Memory verification 真实集成测试；Node24 字体构建曾在同SHA首跑失败、重跑通过，根因未证明修复。
3. Landing 无JS可达性、低动态和菜单焦点需单独修复/实测；P0保护设计不意味着固化已识别的缺陷。
4. 后台任务尚无耐久续跑；Storage失败后继续删DB记录的路径可能失去清理依据；Project/Vault/Runtime实体及控制均未实现。
5. CTMR无已证实Web API，模型包缺元数据/实际权重，存在模拟mask界面；医学有效性、私有素材公开许可均未验收。
6. Production migration/RLS/存储与真实部署交互仍未核验；Vercel success和隔离CI不替代实际环境验收。

后续从独立CI覆盖修复和Claude视觉补救候选开始审阅，再按阶段批准实施。P0资料包含私有CTMR线索与内部权限策略，应在任何公开PR前另行脱敏与作者授权审查。
