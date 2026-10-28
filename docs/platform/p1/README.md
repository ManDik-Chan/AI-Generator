# P1-A 最终集成候选

本目录仅提交 P1-A 私有资产安全整改及必要的测试/CI 依赖；P0/P0.5 归档与历史规划包不纳入此补丁。

- [固定 SHA 验收报告](FINAL_ACCEPTANCE_387aca7.md)：历史验收只绑定 `387aca7`，不转移为本 PR 新 SHA 的验收。
- [最小范围、依赖与自查](INTEGRATION_SCOPE.md)：代码、迁移、测试及 Owner 清单。
- [文件完整性与证据索引](evidence/integration-scope.json)：逐文件 blob 与固定快照对应。

Owner 记录：[Issue #26](https://github.com/ManDik-Chan/AI-Generator/issues/26)，当前 `OWNER_REVIEW_PENDING`。本 PR 必须在自身新 SHA/PR 测试合并提交上重新满足 required checks；没有自动合并、部署或生产 Supabase 操作。**P1-B/C 继续 NO-GO**。
