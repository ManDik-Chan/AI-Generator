# 实施拆分、回滚与 QA Gate

> INTERNAL · DRAFT · **Inferred / Proposed**。只描述未来 PR，不在 P0 创建分支、表或部署。文件路径是预计边界，应在每个 PR 中以真实 diff 再确认。

## 拆分表

| 候选 PR / 阶段 | 文件范围 | 迁移及前置依赖 | 回滚 | 必须补的真实测试 / Owner 关口 |
|---|---|---|---|---|
| 00 · P0 规范交付 | `docs/platform/**` | 无 migration；固定 SHA、证据和契约校验 | 移除文档候选，不触应用 | 独立审查；Owner 签署范围/权限/视觉，未签不得冻结 |
| 01 · 基线 CI 完整性 | `.github/workflows/security-acceptance.yml`、集成测试入口/报告 | 不改 required settings；先修已确认的 verification suite 漏跑 | 回退 workflow；保留原 required contexts | 隔离 Supabase 跑完整 integration；分清 skip/失败/绿灯；Owner 接受覆盖 |
| 02 · Landing 无JS/可访问性补救 | Claude 负责 `features/landing/*` 与专门 E2E；先 RFC | 视觉/动效 golden；不改旧 Lumen 全站 | 单独回退 UI commit | 无JS首屏、reduced-motion、键盘/菜单焦点、7宽度/手机录屏；Owner批准有意差异 |
| 03 · P1 Registry 基础 | `prisma/schema.prisma`、新增版本化 migrations、`features/projects/registry`、授权层 | 仅 Project/Version/最小 Member 与默认 deny；无需 Run/Vault | 关闭 flag/回退应用；保留兼容表与收紧权限 | clean + incremental migration/rollback；Public/Private/Unlisted、IDOR、匿名 PostgREST；Owner批模型 |
| 04 · P1 只读 Showcase | `app/(marketing)/explore`、项目详情、`features/projects/presentation`、`app/api/v1/projects` | PR03 与批准的 Presentation；仅审核静态素材 | 关闭目录/项目路由；保留旧Landing/Workspace | 非AI fixture接入；无假指标；HTML/URL清洗、私有泄露、离线/响应式；Claude视觉与Owner验收 |
| 05 · P2 成员/安装/能力授权 | 新增 Member/Installation/Grant migration、`authorization`、新 API | PR03；细分角色、邀请/撤销策略冻结 | 停止新授权/执行，保留撤销与审计 | A/B JWT、跨版本/伪造grant、成员移除、并发邀请/转移；Owner签权限矩阵 |
| 06 · P2 资源治理 | `lib/platform/storage`、Audit/Share/DeleteTask schema、隐私接口 | PR05；存储分类/留存/删除策略审批；无真实医学数据 | 关闭分享/上传，保持读取隔离和清理任务 | storage JWT、过期/撤销URL、导出/删除/派生结果/失败重试；Owner签数据策略 |
| 07 · P3 开发者协议/发布 | Manifest/OpenAPI validators、Endpoint Registry、`app/(platform)/developer` | PR03/05；快照 hash、发布审核、服务器引用策略 | 关闭发布入口；保留稳定版本，不覆写历史快照 | 恶意URL/$ref、深度/大小、字段白名单、越权发布、版本冲突；Owner冻结契约，Claude发布向导 |
| 08 · P4 持久任务基础 | Run/Step/Outbox/CallbackReceipt/Ledger migrations、`lib/platform/runtime` | PR05/06/07；先完成队列Spike；执行开关关闭 | 停止派发、可读状态、补偿排空；不删除账本/回调去重 | kill各窗口、重复投递、fence、外部未知结果对账、并发幂等/费用；Owner批运行方案 |
| 09 · P4 测试 Adapter/上传 | `egress`、upload-intents/completions、callback API、独立 synthetic Worker | PR08；固定Endpoint/独立出站网络/合成数据 | 停用Endpoint；拒新任务、隔离迟到结果 | SSRF/DNS/重定向、回调重放、取消/超时、>10MB直传/分块/扫描；Owner受控开放 |
| 10 · P5 Vault 与显式路由 | Credential/Payload/CredentialGrant migrations、KMS gateway、Connection UI | PR05/08/09；KMS与会话模式Spike、审计/撤销Gate | 关闭BYOK，保留旧平台路径；不静默回落；安全销毁按策略 | A用B key、轮换/撤销、日志/浏览器/队列泄密、模型/audience/费用、后台子调用；正式安全评审+Owner |
| 11 · P5 AI Hub 导航兼容 | 新导航选择层、既有 `lib/ai` Adapter 集成；Claude UI PR分开 | PR10通过；旧API/SSE/额度行为快照 | 回退新增选择层和导航；旧URL有效 | Chat/Persona/Memory/Tools/Agents/Auth全回归、模型失败不换key；Owner批准迁移体验 |
| 12 · P6 CTMR Adapter | CTMR独立仓库/镜像、模型包、平台通用Viewer/结果映射 | PR09，若用BYOK还需PR10；作者许可、补权重/元数据/合成几何 | 停用CTMR版本和Endpoint，保留已授权自有结果 | Python无UI推理、模型指纹、坐标/spacing/affine、断电续跑/取消、硬件预算；作者与Owner批准，仅研究演示 |
| 13 · P7 Beta | SDK/docs/version policy、告警/运维审计、发布checklist | 所有相应安全门禁；邀请制范围另签 | 关闭新注册/安装/运行，明确支持/回滚 | 第二个非AI项目、无障碍/动效/性能、故障演练、实际环境smoke；Owner最终决定发布 |

## 每 PR 必须保存的结果

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm exec prisma validate` 的真实退出码、commit、Node/pnpm版本；涉及 Auth/RLS/存储/运行的改动，还要隔离 Supabase、完整 `pnpm test:integration`、`pnpm test:rls`、认证 E2E。所有通过/失败/skip 分开，不能只写 READY。UI 保存 desktop/mobile/reduced-motion/无JS、键盘/触屏和动效录屏；基线变更说明及 Owner 签署随 PR 保留。

P0 本身只运行文档结构/契约校验和源码一致性检查，**没有本地重跑上述应用测试**。既有 CI 的真实结果和缺口见 [CI 审计](12-ci-and-branch-audit.md)，不能混为本轮执行。

## Migration 与发布顺序

生产操作须另获 Owner 明确批准，先备份并演练恢复 → expand兼容结构/权限 → 读写验真 → 部署flag关闭应用 → backfill/verify → 小流量启用 → 观察/回滚。数据库升级与 Vercel 自动部署不能假设原子同步；会读取新表的应用必须等兼容迁移验证完成。上线 migration 不原地改写，结构/权限回退优先前向修复，不为回滚恢复浏览器写运行状态的权限。

## 阶段门禁结论

| Gate | 当前结论 | 解除条件 |
|---|---|---|
| P0 文档交付 | 候选与文档自查已完成，待Owner审阅 | [自查报告](13-self-audit-and-verdict.md)及Owner明确 APPROVED/CHANGES_REQUESTED |
| P1 实装开放 | NO-GO（未授权进入，模型/API/视觉尚未冻结） | Owner批准规范，CI缺口处置、最小Project隔离与视觉基线 |
| P4 受控远程/GPU执行 | NO-GO | 持久队列/出站/资源/授权故障注入通过；不解锁V1禁止的任意第三方代码 |
| P5 BYOK | NO-GO | KMS/会话/权限/计费/泄密验收通过 |
| P6真实医学数据 | NO-GO，默认不开放 | 另行策略、安全、数据治理及适用合规评审与授权 |
| Production Ready | NO-GO（缺实际环境证据） | 固定部署/迁移/RLS/存储/真实smoke与审批，不以文档替代 |
