# 固定 SHA 验收报告 — 387aca7

2026-10-28 · Asia/Singapore。此文件新增历史证据索引，不改写此前失败记录。

| 项目 | 已核实事实 |
|---|---|
| 验收源码 | `387aca73d0a44a72f8cf80a0dfa602811e4a8891`，分支 `codex/p1-a-final-evidence-20261028` |
| main 基线 | `e33ac216bdcffc44d12d4b7315e0d6cc48decf5c` |
| 固定 SHA CI | [Security Acceptance](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40666865211) 5/5、[Merge Gates](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40666871300) 8/8 成功；六个 required contexts 均成功 |
| 真实安全 | PostgreSQL/JWT/RLS/Storage 7 套 51 项通过；同工作流静态/单元 150 文件 863 项通过。原本地全量为 914/914，原 903 项保留 |
| 迁移 | 21 个历史迁移从零部署与旧库升级；Proposal/Verification clean/incremental 失败回滚；8 个显式事务的独立回滚指纹均 pass/dataLoss=0 |
| Owner 决策 | [Issue #26](https://github.com/ManDik-Chan/AI-Generator/issues/26)：`OWNER_REVIEW_PENDING`，并非合并、生产或 P1-B 授权 |

完整旧证据仍保留在固定提交中：[首次红灯记录](https://github.com/ManDik-Chan/AI-Generator/blob/387aca73d0a44a72f8cf80a0dfa602811e4a8891/docs/platform/p1/evidence/verification.json)、[Storage 整改记录](https://github.com/ManDik-Chan/AI-Generator/blob/387aca73d0a44a72f8cf80a0dfa602811e4a8891/docs/platform/p1/remediation/evidence/verification.json)。原 A-DEL-01/A-NS-02 的两个失败断言保留在测试中；未通过删除测试、降低权限或跳过检查取得绿灯。精简 PR 不复制这些历史大报告，也不修改验收分支。

原坏例分别为 Storage 失败后误报成功并丢失清理依据、损坏路径被交给高权限删除器；整改引入持久意图、完整 owner/resource/scope/kind/bucket/path 校验及幂等恢复。三类私有资产、级联、进程中断、DB ack 故障、上传 RESERVED 与跨用户隔离均有真实隔离回归。

**新 PR 是新的源码 SHA。** 此处的 13/13 和 51/51 只能说明上述固定提交；新 PR 的正式结果须读取它自己的 Actions/Check Runs，未执行、运行中或失败不得写作已验收。针对性本地验证及逐文件对应记录见 [集成范围](INTEGRATION_SCOPE.md)。

继续保留的边界：生产历史 bucket/库存未盘点，未知映射默认 BLOCKED；RESERVED 只支持确认上传已静止后的人工恢复，无自动过期回收/告警 SLA；已有短签名及已下载字节不承诺即时撤销；负载下锁争用/SSI 重试未做 SLO 验收；13 个无显式 BEGIN 的旧迁移未逐条做事务故障注入。认证 E2E 不替代视觉验收，已验收 Claude Landing 保持不变。

范围建议仅为审核并集成 P1-A 最小补丁，最终决策归 Owner。生产迁移、生产清理、部署、main 合并、BYOK、第三方执行、GPU/CTMR 推理以及 P1-B/C 均未获授权。
