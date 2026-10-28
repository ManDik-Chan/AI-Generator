# P0.5 Architecture Convergence

内部 · 2026-10-28（Asia/Singapore）· DESIGN-ONLY / OWNER PENDING。

本包收敛规范候选并提供离线参考校验；不实施 P1。**可向 Owner 申请 flag 关闭的有限 P1 开发；当前没有 P1 GO，对外开放仍 NO-GO。**

| 交付 | 内容 |
|---|---|
| [架构与决策](architecture.md) | 范围、原路线图对照、兼容性、未来 API 边界 |
| [11 项追踪矩阵](remediation.md) | R01–R11 原证据、决策、验收、未关闭原因 |
| [Registry / Publication / DTO](registry-publication.md) | 8 个实体、状态、权限、不可变快照、失败与回滚 |
| [资产协议](assets.md) | 来源授权、上传/净化、独立存储、读取、撤回 |
| [机器契约](contracts/README.md) | OpenAPI、Manifest、Presentation、Draft、Release、内部命令 |
| [威胁与验收矩阵](security-tests.md) | 服务端与 JWT/GRANT/RLS 双路径真实负例 |
| [Claude 交接](claude-baseline.md) | 当前源码视觉基线、保护边界、缺失 golden |
| [CTMR 表达验证](ctmr-reference.md) | 已实现/声明/实验/规划分开，无 CTMR 核心特例 |
| [P1 拆分](p1-tasks.md) | 依赖、代码与视觉分工、验收、回退 |
| [自查及最终建议](self-review.md) | 复核发现、修订、验证等级与 Owner 批准集合 |
| [运行说明](validation/README.md) | 离线执行、参数化 P0 重跑、源码边界检查 |
| [基线](evidence/baseline.json) / [校验](evidence/validation.json) | 本轮实际证据；与历史 CI 分开 |
| [最终完整性](evidence/final-audit.json) | 618原有源码blob、生成稳定性及原checkout保护 |

`contracts/*.json` 是机器约束；本目录 Markdown 定义事务、权限和语义义务，两者必须同时满足。所有新接口均为候选，当前应用没有实现。生成器只生成本目录机器契约；旧 P0 生成器仅归档。未知字段和未知 schemaVersion 拒绝，不静默迁移。

状态用词：SPEC-RESOLVED = 规范断点已修订且参考规则有测试；OPEN = 真实风险/证据未关闭；DEFERRED = 明确留待后续阶段。三者均不表示生产安全已验收。
