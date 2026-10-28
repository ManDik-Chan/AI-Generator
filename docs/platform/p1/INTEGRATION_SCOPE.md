# 最小范围、依赖与 Owner 清单

集成分支从最新 main `e33ac21` 新建，与验收分支分开。42 个非文档文件取自已核实快照；除为本集成分支增加禁止自动部署的精确配置外，生产代码、迁移、测试断言、CI 与运行器均逐文件保持一致，见 [机器索引](evidence/integration-scope.json)。

| 必须一起提交 | 依赖及不可省略的原因 |
|---|---|
| `features/storage/*`、三类 Storage wrapper、avatar/image services、Tool actions | 唯一高权限删除边界、写前预约、持久意图、幂等消费及正常/补偿/过期清理；省略任何入口会绕过边界 |
| 五个现有 API route、可信目标签发 | 同一认证 owner、待删源停止新签名/恢复、成功/待清理/阻断语义及防目标伪造；不能只合并删除函数 |
| Prisma schema + 4 个有序 migration | 清理账本、源标记、复合所有权 FK、不可变身份、cascade retry 与 attachment fence、存量验证；不拆散 schema/DDL，不修改 17 个既有 migration |
| 既有测试适配 + 3 个删除/Storage 集成套件与两个进程夹具 | 保留正常行为与原安全断言；旧删除套件的 DB/Auth 真实、Storage 为受控故障边界，另两套使用实际 Storage；覆盖失败、越权、恢复、竞争、历史路径与 RESERVED |
| 统一测试发现/报告验证、隔离 reset/迁移 verifier、CLI 条件与配置 | 修复 verification 漏跑；所有真实套件必须发现、实际执行、零 skip/TODO；阻止默认目录 reset 和非隔离连接 |
| 安全 workflow、Storage 测试配置与分支部署保护 | 真实 Storage/迁移/权限门禁可运行；六项 required checks 不减少。禁止自动部署仅增加此集成分支，不改变 main 设置 |

排除：`docs/platform/archive/p0/**`、`docs/platform/p05/**`、P0/P0.5 输入/候选生成器/审计大报告、历史 P1 规划包。没有实现或引入 Project Registry、Draft/Release/Publication 或新 UI。运行时和测试未依赖被排除文档；固定报告以永久 SHA 链接保留审计链。

## 本地检查与新 PR 门禁

本轮只做内容完整性、依赖闭包、迁移/安全断言 blob 比对、Lint、Typecheck，以及受影响的路径授权、DTO/错误响应、服务编排和 CI 发现行为的针对性用例。结果写入机器索引；不重复旧 SHA 已跑的 914 项或重建数据库。生产 Supabase 未连接，本机浏览器未运行。

新 PR 将触发未删减的正式工作流；旧 SHA 的 CI 不继承给新 SHA。必要的真实数据库/Storage、迁移及浏览器门禁由 PR 自身结果判定，未运行/运行中保持待验收。

## Owner 验收清单

- [ ] 确认范围只包含 P1-A，42 文件依赖完整，P0/P0.5 归档不进入补丁。
- [ ] 确认生产代码、4 个 migration 和全部安全断言与固定验收快照一致；只有部署保护增量与必要文档不同。
- [ ] 审阅 Issue #26、历史红灯及本 PR **新 SHA** 的六个 required checks；不得用 387aca7 的结果代替。
- [ ] 接受未知 bucket 默认阻断、人工 RESERVED 恢复、签名时窗及负载可用性的剩余边界；生产启用仍需独立核查。
- [ ] 单独决定是否合并；本任务没有合并/部署/生产数据操作授权。
- [ ] 如要启动 P1-B，另行明确授权。当前 **P1-B/C NO-GO**，没有提前实施。

自查重点：漏依赖、越权入口、先丢依据后删对象、测试断言变化、迁移重写、误带档案、Landing 变更、保护下降与旧 CI 冒充新 CI。逐文件校验及针对性验证通过后才创建 PR，正式验收仍归 Owner。
