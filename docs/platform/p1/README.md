# P1 Limited Implementation — P1-A

2026-10-28（Asia/Singapore）· 内部 · **两项删除阻断本地整改通过；P1-A 整体验收待补证，P1-B/C NO-GO**。

最新代码、实际测试、风险及自查以 [本轮整改包](remediation/README.md) 和其 [机器证据](remediation/evidence/verification.json) 为准。下列既有实施/阻断/验证报告及 `evidence/verification.json` 是 fbd29c4 首轮快照，保留历史红灯。当前独立整改分支为 `codex/p1-a-security-remediation-20261028`。

Owner已授权有限内部开发和隔离测试；此授权不代表安全验收通过，不允许生产迁移、部署、合并或对外开放。BYOK、任意第三方执行、GPU和CTMR真实推理持续NO-GO。

独立分支 `codex/platform-p1-limited-20261028`，基线 `b7d1e1f05dda563a0179597078e1abb8b7c2f534`。main仍是 `e33ac216bdcffc44d12d4b7315e0d6cc48decf5c`；无关PR #1不纳入。原checkout及Landing未改。P0/P0.5是只读规范输入，当前实现状态以本目录为准。

| 阶段 | 范围与门禁 | 当前结果 |
|---|---|---|
| P1-A | CI完整发现/执行；真实本地迁移、JWT/RLS、verification；旧资产删除风险与故障回归 | 两项安全整改已实现并本地通过；旧迁移 reset/升级回滚及远端 CI 证据仍未关闭，整体未验收 |
| P1-B | Project Schema、所有权/RLS、DraftDTO、不可变Version、审核发布状态机 | **未开始**，A门禁未过，不能自动推进 |
| P1-C | 经批准静态资产、只读安全投影、撤回/归档/删除闭环、低保真工程验证 | **未开始**，依赖B通过；视觉终验仍需Claude/Owner |

P0.5未命名A/B/C，上表是本轮按既有任务依赖建立的对应。Owner后续明确要求先输出P1-A真实结果和P1-B准入结论，本轮在A阻断处停止。

- [代码与API状态索引](implementation.md)
- [阻断报告与风险矩阵](blockers.md)
- [Claude交接](claude-handoff.md)
- [自查与准入建议](self-review.md)
- [隔离复现](validation.md)
- [基线](evidence/baseline.json)、[实际验证](evidence/verification.json)
- 技术规范仍以 [P0.5](../p05/README.md) 为准；未改写其冻结输入或用离线用例冒称新Project已实现。
