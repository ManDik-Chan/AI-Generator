# P1-A 阻断报告

> 本文件为 fbd29c4 首轮快照，以下 OPEN/失败描述是历史结果。当前两项整改、剩余阻断与准入结论见 [最新风险矩阵](remediation/risks.md)，完整测试见 [整改机器证据](remediation/evidence/verification.json)。

**P1-A未通过；P1-B NO-GO。** 新P0/P1问题发生时停止受影响模块并报告，是本轮Owner明确要求。当前只完成CI整改与隔离验证，不继续Project Core。

| ID / 等级 | 事实与证据 | 影响 / 状态 | 解除条件 |
|---|---|---|---|
| A-DEL-01 / High（既有R06） | `assets.ts`捕获Storage错误后return，`actions.ts`继续删除ToolRun，FK cascade删除ToolAsset。真实DB故障用例观察success=true、两类记录均0 | 可能残留Storage对象并失去重试依据；**真实DB已复现，OPEN**。Storage失败通过受控注入，不声称已在真实对象服务删除失败后确认残留字节 | 先保存可恢复清理意图/逐对象状态；删除/撤权先不可读；保留依据直至清理确认；测试Storage失败、DB失败、响应丢失、部分成功、重复/并发、重启恢复及账户/父记录级联 |
| A-NS-02 / High（新增条件性边界缺口） | 真实DB接受owner=A而storagePath前缀=B的损坏行；A的已认证删除Action把B前缀交给高权限remover，返回成功。新失败用例记录该调用 | **服务层命名空间防线缺失**；不是已证实普通JWT可写损坏行或直接删B对象，实际Storage网络调用已用故障边界替代。已停止旧资产模块实施。公开读取/签名使用同storagePath，也需专项复核 | 校验asset→run→owner联合归属；bucket/path固定授权，拒路径编码/穿越/错namespace；数据库复合FK/check及存量只读审计计划；真实A/B JWT、服务端损坏记录负例、实际Storage验证。禁止自动删除不合法路径 |
| A-MIG-03 / High / 未验收 | 原migration verifier的reset按cwd操作默认Supabase项目，不能直接用于本轮临时workdir | 本轮未执行该reset，不宣称已造成误删。目标选择不一致，不能用它取得旧库/回滚绿灯 | reset前验证显式workdir、Docker项目标签和实际DB_URL与所有Prisma URL一致；单独隔离环境复验，不修改原保护 |
| A-CI-04 / 运行证据待补 | 本地统一入口已执行5套26项，能发现新增失败；远端CI未触发 | 覆盖漏测配置已修，整体安全结论仍失败；六required contexts未改 | 修复安全问题后，在固定SHA完整运行并保存pass/fail/skip；远端结果独立取证 |
| A-ENV-05 / 已恢复 | Docker最初启动因dockerInference socket错误退出；Owner恢复后Engine29.6.2可用，容器操作及17迁移/真实测试完成 | 不是当前主要阻断；本任务未删除/修改Docker保护文件或全局设置 | 若再次退出，保留诊断并停止，不循环重启 |
| A-VIS-06 / 未验收 | 无绑定SHA golden；浏览器自动化仍禁用 | 未修改Landing；不阻断当前命令行取证，阻断未来视觉验收 | 单独恢复浏览器授权、Claude素材/行为验证及Owner接受 |

普通JWT的跨用户读写、Profile自提权和运行表mutation已有7项真实RLS测试通过；它们不能替代高权限服务自身的路径和所有权校验。当前没有确认生产已应用这些migration，也没有读取生产配置来补结论。

修复顺序：A-DEL-01/A-NS-02共同设计最小删除意图和owner/path约束 → 在本地版本化迁移与损坏行负例中验证 → 真实Storage/撤回/故障窗口复验 → 全部安全套件零失败零意外skip → 复核A-MIG-03与完整回归 → 再提交P1-B准入结论。P1-B不得依赖旧ToolAsset删除服务。
