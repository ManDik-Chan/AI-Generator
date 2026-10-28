# 风险与门禁矩阵

| ID / 等级 | 当前事实 | 状态与后续条件 |
|---|---|---|
| A-DEL-01 / High | 原失败断言不变；Storage HTTP 503、DB 确认失败、进程退出、重复/并发、级联与真实对象重试均通过 | **LOCAL-VERIFIED**；没有以吞异常、删源记录或跳过测试隐藏故障 |
| A-NS-02 / High | 三类高权限删除统一走不可变意图及完整身份校验；损坏 ToolAsset/头像/图片引用与错误 bucket 真实负例通过，另一用户字节仍在 | **LOCAL-VERIFIED**；不是声称高权限凭据泄露或管理员任意改表也可防御 |
| A-MIG-03 / High | 旧 reset verifier 按 cwd 选择默认 Supabase；本轮仍未调用该危险 reset | **OPEN / P1-A 整体验收阻断**。本轮仅允许两个阻断整改，未重构旧迁移验证器；需另行按显式目标验证旧库升级与故障回滚 |
| A-CI-04 / gate | 本地完整发现执行与全量回归通过；远端本 SHA 尚未触发 | **OPEN**。required contexts、保护和失败语义未减；不得把本地成功写成远端 CI 绿色 |
| LEGACY-BUCKET / High before enablement | 无 bucket 的旧记录默认 BLOCKED；跨 owner 历史 FK 校验不通过则迁移失败 | **发布前阻断**。运营核查存量、确定 bucket 绑定，不能猜测、自动清理损坏路径或批量改写 owner |
| RESERVED / Medium | 上传之前有持久登记；崩溃后未附着的 RESERVED 保留可核查的 key，不自动升级删除 | **人工恢复边界**。先证明上传进程/请求已终止并查明源是否存在，再调用受控补偿；不能按时间猜测完成，防止晚到上传重新写入。自动租约/恢复 SLA 未实现，扩大上线前需验收运维流程 |
| RETRY-OPS / Medium | PENDING 由显式维护命令重试；BLOCKED 保留且不盲删，失败统计明确 | 未建立后台调度/告警 SLA。维护命令退出表示一次扫描完成，必须检查 failed/pending/blocked；存在阻断不能宣称全部资源完成 |
| LOCKING / Medium availability | prepare/worker 对源与任务的锁顺序可能遇到死锁；事务失败保留依据，返回未完成 | 并发请求与消费者回归已过；不承诺零冲突或吞死锁成功。长 Storage 故障可占用事务连接至 timeout，规模化前评估 |
| PARENT-HISTORY / Low | 对象 COMPLETE 和父 ToolRun 删除不在一个跨系统原子操作中 | DB 后续故障可能保留父历史；不能返回完全成功，按 run ID 重试。不影响对象依据或跨用户安全 |
| SIGNED-URL / Medium | 新读取已排除待删源；已签发短期 URL/已下载数据存在边界 | 不承诺追回字节；未来公共资产必须独立实现 P0.5 撤回协议及 CDN 验收 |
| A-VIS-06 / gate | 无页面/组件/主页修改，无浏览器运行 | 视觉仍未验收；仓库禁止浏览器自动化，需另行恢复授权。当前 CLI 安全回归不代替视觉验收 |

P1-A 两项整改可申请 Owner 接受本地证据；P1-A 整体不能自动标记通过，P1-B/C 继续 NO-GO。对外开放、生产迁移/部署、合并 main、BYOK、第三方执行、GPU 调度、CTMR 真实推理继续禁止。
