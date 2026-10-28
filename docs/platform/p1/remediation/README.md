# P1-A 两项安全阻断整改

2026-10-28 · 内部隔离验证 · **专项修复通过本地回归；P1-A 整体验收待补证，P1-B/C NO-GO。**

基线 `fbd29c4030ebf9292e156c49c6263e6dea6dd55b`，包含 `ec8a52a81d368b1a85f30d3d6a6d0a0eaaccd1b7`；开始时 P1 工作区干净。独立分支 `codex/p1-a-security-remediation-20261028`，没有覆盖原 checkout 或 P0.5。代码提交与逐例测试结果见 [机器证据](evidence/verification.json)。

GitHub 只读核对 main 与首轮 e33ac216 完全一致，见 [远端记录](evidence/remote-main.json)。本地缓存 origin/main 较旧，没有用它重设基线或合并。

本轮仅修旧私有资产删除一致性及高权限删除授权，未实施 Project Core、发布协议或新页面。没有生产连接、生产迁移、部署、主线合并、推送或浏览器运行。

代码提交 `4125e9d`。全量 Vitest **903/903**；其中真实集成 **42/42（6 套，含新增 Storage 16 例）**，失败与跳过均为 0。Lint、Typecheck 通过；原 P0 的另 42 项结构用例只读重跑通过，不计作真实安全验收。

隔离快照中 21 个迁移均已应用且校验和匹配；三个私有测试 bucket 剩余对象 0、PENDING/RESERVED 0、Auth 测试用户 0。跨轮故意损坏/旧 bucket 未绑定的合成依据保留为 128 条 BLOCKED，过期扫描仍明确报告 12 条拒绝清理，不能写成全部清理成功。专用容器已停止，卷保留，Docker 引擎继续运行。

- [代码、数据及 API 索引](implementation.md)
- [风险与门禁矩阵](risks.md)
- [测试结果及复现边界](validation.md)
- [单独自查与修订记录](self-review.md)
- [Claude 工程交接](claude-handoff.md)

原 `../evidence/verification.json` 保留首轮 870 通过 / 2 失败的历史证据；不覆盖成绿色。本目录证据是本轮修复后的结果。P0/P0.5 冻结规范未改。

建议 Owner 接收两项整改的本地测试结果。远端固定 SHA CI、旧迁移 reset 目标约束及升级/回滚证据仍未补齐，不能宣布 P1-A 全部验收，更不能自动进入 P1-B。
