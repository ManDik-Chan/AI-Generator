# Phase 7A1.1 项目所有者真实验收阻断记录

> 记录日期：2026-07-19。当前分支：`codex/v2-phase-7a1-1-agent-workers`；现有 Draft PR：#20。正式域名：<https://www.ai-mdc.com>。

## 现场保护

- 项目所有者已在现有 Supabase 数据库执行 `20260718160000_add_agent_workers`。
- 本修复不得修改、删除或重命名该 migration；开始修复时文件 Git blob hash 为 `8619b213077ccff6ca790c31343e17f0ba088a1a`。
- 不执行 migrate reset、migration、RLS、数据清理或 Production 部署，不删除失败的 AgentRun，不读取或提交密钥。
- 基线为 `f6ab023e2f1324322aa6e5c0f965855372a81a87`，本地与远端目标分支同步，PR #20 保持 Draft。

## 真实错误与用户可见结果

项目所有者在真实登录态启动 Standard Agent 后，Planner Provider 调用已经计为 1 次，但 Worker 尚未创建。终端随后报告：

```text
Invalid prisma.agentEvent.findFirst() invocation
Transaction API error: Transaction already closed
The timeout for this transaction was 5000 ms,
however about 6511 ms passed since the start of the transaction.
```

同一运行的状态 GET 曾耗时约 1–9.5 秒并被连续请求。Chat 显示 `失败 / 0/4 Worker / 0 成功 / 1 次调用 / AGENT_ERROR`。全局停止与单 Worker 停止不能可靠收敛，切换 Conversation 后 Composer 还会继承其他对话的生成/停止状态。

## 四个 Agent 生命周期根因

### 1. AgentEvent 写放大使 interactive transaction 过期

`appendAgentEvent()` 每次都执行 Run 行锁、最后 sequence 查询和单行 insert。`persistAgentPlan`、`cancelAgentRun` 与 `finishAgentRun` 又在同一事务循环调用它。以计划持久化为例，Standard 约 21 个数据库语句、Deep 约 27 个；远程数据库 RTT 累积后超过 Prisma 默认 5 秒事务期限。

修复策略：一次锁定 Run、一次读取最大 sequence、内存分配连续 sequence、一次 `createMany` 写入整批安全事件；Worker 创建/状态更新也使用集合操作，不在循环内执行数据库查询。事务 timeout 只保留为保护边界，不作为根因修复。

修复后计划持久化不再随 Worker 数量增加数据库往返：Standard/Deep 都是 6 个语句（Run 锁、Run 校验、Worker `createMany`、Run 更新、sequence 查询、Event `createMany`）。行为测试以每个语句 50 ms 的人工延迟完成 Standard 4-Worker 计划，约 300 ms；8 条事件的独立批写以每个往返 100 ms 的人工延迟约 300 ms，均明显低于 5 秒事务边界。并发批写测试验证锁内得到的 sequence 为连续唯一的 `1,2,3,4`。

### 2. 取消与失败终态依赖长事务和重型刷新

全局取消对每个活动 Worker 循环追加事件；单 Worker 取消和 Worker/Leader 状态提交也重复锁定/查询。事务失败时 API 无法提交真实 CANCELLED，UI 随后又依赖重型详情 GET 确认，导致“正在停止”长期存在。进程崩溃后的旧 PENDING Run 没有安全 reconciliation。

修复策略：Run/Message/活动 Worker/批量事件在短事务内按顺序提交；Provider 只根据已提交的持久终态收到 AbortSignal；所有迟到写继续以 PENDING/RUNNING 条件保护。增加超过 total timeout + grace 的 owner-scoped stale reconciliation，将 Run、Message 与活动 Worker原子收敛到安全 ERROR/TIMEOUT，并停止轮询。

实现采用 Agent 总时限（默认 285 秒）加独立 grace（默认 15 秒）作为 stale 边界，不依赖 Provider 密钥是否配置。详情/状态读取发现过期 PENDING 时，会在 Run 行锁内把活动 Worker 标记为 `TIMEOUT/STALE_RUN`、Message 标记为 ERROR、Run 标记为 `ERROR/FINISHED/STALE_RUN`，再一次批写审计事件。取消状态按持久化结果驱动 AbortSignal；终态写入失败时 SSE 明确返回 `PERSISTENCE_ERROR`，不再伪装为 CANCELLED。行为测试覆盖全局取消幂等、stale 收敛、Provider 信号中止及 CANCELLED 后迟到 Worker 结果被拒绝。

### 3. 详情 DTO 被当作轮询 DTO，且轮询可重入

`GET /api/agents/[id]` 每次同时读取 Conversation 标题、用户问题、Assistant 内容、完整 Worker deliverable、全部 AgentEvent，并统计当天 Agent Credits。`useGenerationRecovery` 没有 in-flight 去重；focus、pageshow、visibilitychange 与 timer 可以并发进入 `check()`，各自继续安排下一轮，造成 GET 风暴。

修复策略：新增轻量 `/status` DTO，不含 Event、完整 deliverable、用户问题、Conversation 标题或 Credits；详情只在明确展开/详情页读取。轮询按 runId 保证单请求/单 timer，前台约 2 秒、网络错误指数退避、隐藏/卸载/终态/401/404 立即停。

### 4. 生成与恢复状态是跨 Conversation 的全局标量

`ChatLayout` 以单个 `generating`、`generationKind`、`assistantMessageId`、`agentRunId`、controller 和两个全局 sessionStorage key 控制整个 Chat 客户端生命周期。路由切换后旧 Run snapshot 仍能把新 Conversation 的 Composer 设为 generating，并让停止按钮指向旧任务。

修复策略：建立有版本、有限条目且不含正文的 Conversation-scoped session registry；普通 Chat 与 Agent 的活动标识都按 conversationId（新聊天先用临时 token）保存。React 只把当前 Conversation 的状态投影到 Composer；不匹配 snapshot 只更新 registry，不能污染当前消息或输入状态。终态与登出清理对应记录。

## 独立 P0：Chat Route Entry Latency

该故障发生在没有任何生成任务时，不能归因于 Agent polling。当前 `/chat` 在返回 `ChatLayout` 前串行等待认证，再并行等待完整 Conversation 列表和 Persona choices；`/chat/[conversationId]` 还同时等待 Conversation 列表、当前详情以及包含完整 Worker/Event 的全部 AgentRun。`loading.tsx` 只有不可输入骨架，因此慢查询会阻塞可操作 Composer。

修复策略：真正 shell-first。认证与最小 AI 配置之后先提供 Chat Header、消息区和可输入 Composer；Conversation Sidebar、Persona choices 与紧凑 Agent 摘要各自异步加载。新聊天首屏不读取 AgentRun；已有聊天不读取 AgentEvent、Credits 或完整 Worker deliverable。首页核心 `/chat` Link 保持预取和即时导航反馈，动态历史/Agent 详情仍不批量预取。

首个独立 checkpoint 已将 `/chat` 首屏阻塞查询收敛为一次认证；Sidebar 与 Persona 在客户端挂载后通过一次并发 bootstrap 请求加载，并附带 `Server-Timing`。本地生产构建通过，`/chat` First Load JS 为 178 kB。由于本地没有 Supabase/数据库环境变量及认证状态，Dev Cold/Warm、local production 登录态 TTFB/可交互时间与 Vercel Preview 本轮无法诚实测量，保留为真实环境未验证项；项目所有者报告的修复前观测值为 4–5 秒。

## 验收条件

- Standard/Deep 计划分别批量创建 4/6 Worker，事件 sequence 连续唯一且最多 96 条；人工数据库延迟下事务仍在 5 秒边界内完成。
- Planner、Worker、Leader 阶段的全局取消和单 Worker 取消均幂等、可持久化，并能中止 Provider；数据库失败不得伪装成 CANCELLED。
- 陈旧 PENDING Run 安全进入终态；迟到结果不能覆盖 CANCELLED/ERROR/TIMEOUT。
- 每个 Run 只有一个轮询循环；状态 GET 不加载 Event、Credits 或完整 deliverable，终态立即停止。
- Chat A 与 Chat B 的普通/Agent 生成、Composer 和 Stop 完全隔离；新聊天确认 ID 后迁移 registry。
- `/chat` 点击 100 ms 内有反馈，预编译环境中 Shell/Composer 目标 1 秒内可见可输入；慢 Sidebar/Persona/Agent 摘要不能阻塞 Composer。
- Dev Cold、Dev Warm、local production 与 Vercel Preview 分开测量；无认证状态时必须明确列出未验证项。
- 全部修复继续提交到 Draft PR #20；在真实验收通过前不得标记 Ready 或建议合并。
