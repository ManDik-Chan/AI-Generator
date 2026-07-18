# Chat Agent Mode

> Phase 7A1.1 — Draft. 正式域名：<https://www.ai-mdc.com>。Phase 7A1.2（搜索、文件与引用）和尚未获批的 Phase 7A2（沙箱代码 Worker / Vibe Coding）均未开始。

## 产品入口

Chat Composer 默认仍为“常规”。用户可针对当前一次发送选择：

- 常规：继续使用既有 `/api/chat`，不创建 AgentRun；
- Agent 标准：1 Planner + 4 个动态 Worker + 最多 1 Leader，最多 6 次 Provider 调用，消耗 1 Credit；
- Agent 深度：1 Planner + 6 个动态 Worker + 最多 1 Leader，最多 8 次 Provider 调用，消耗 2 Credits。

Agent 选择只作用于当前发送动作。请求开始后 Composer 回到常规模式；刷新页面不会重新提交，后续常规追问继续读取最终 Assistant Message，不读取 Worker 隐藏数据。编辑最后一条用户消息继续走原有常规 Chat 编辑路径。

## 一次 Agent 发送

服务端从 Supabase 会话取得身份，并在 Serializable transaction 中完成：

1. 校验 Conversation / Persona 所有权与可用状态；
2. 检查当天 Agent Credits；
3. 必要时创建 Conversation；
4. 创建 COMPLETE User Message；
5. 创建 PENDING Assistant Message；
6. 创建 PENDING AgentRun；
7. 写入 `RUN_CREATED` AgentEvent；
8. 用 AgentRun 本身记录本次 Credit 消耗。

事务提交后才实例化执行阶段。Planner 通过严格 Zod 与 DAG 校验后，trusted server 一次性创建固定数量的 AgentWorker；客户端不能提交 userId、Worker 数量/配置、模型、温度、工具、并发、调用次数、Token、timeout 或 Prompt。

## Inline Worker Panel

Worker Panel 位于对应 User Message 与最终 Assistant Message 之间，并按需拆包。普通 Chat 没有 AgentRun 时不会加载完整 Panel。面板显示：

- 标准/深度模式、当前阶段、部分完成/等待依赖/超时等诚实状态；
- Worker 完成数、成功数、真实 Provider 调用数与真实耗时；
- Planner 概览与是否采用安全回退计划；
- 动态 Worker 名称、目标、交付要求、优先级、依赖、状态和安全交付物；
- 单 Worker 停止、全部停止、失败筛选、折叠/展开、复制与详情入口。

取消状态只在服务端确认后显示。复制或取消失败会呈现可访问的错误消息，不产生未处理 Promise。运行中的 AgentRun 不能删除；必须先停止并等待终态，避免留下永久 PENDING Assistant Message。

手机默认折叠 Worker 详情，面板使用单列或两列自适应布局，不创建根级 VisualViewport、页面级横向滚动或第二个主滚动区。Chat 继续由现有 Chat-only VisualViewport controller 维护 iPhone Safari Composer 位置。

## 后台运行、SSE 与恢复

SSE 只是观察通道。页面刷新、网络切换、浏览器切后台、request abort、ReadableStream cancel 或 enqueue 失败只 detach observer；业务 Promise 已通过 `registerGenerationTask` 注册到 Vercel `waitUntil`，本地使用现有 `after` 兼容路径。

浏览器只在 sessionStorage 保存短期 runId。`useGenerationRecovery` 在 mount、focus、pageshow 与重新 visible 时查询 owner-scoped `/api/agents/[agentRunId]`，恢复同一个 AgentRun、Worker、Event 与 Assistant Message。恢复不会 POST、重新调用、重新计费、重置 Worker 或覆盖终态。

## 停止

“全部停止”调用 owner-scoped、幂等的 Run cancel API：AgentRun、仍在 QUEUED/RUNNING 的 Worker 与 PENDING Assistant Message 进入 CANCELLED，已完成 Worker 保留。durable cancellation 让活动 Provider 收到 AbortSignal；迟到结果的条件更新无法覆盖终态。

“停止该 Worker”只更改目标 Worker。其他 Worker 和 Run 继续；依赖该 Worker 的任务按确定性规则进入 BLOCKED。最终至少两个 Worker COMPLETE 时仍可调用 Leader，少于两个则以 `INSUFFICIENT_WORKERS` 结束且不调用 Leader。

## Agent Dashboard

`/agents` 提供 owner-scoped 最近运行、问题搜索、模式/状态筛选、Worker 数、成功数、调用数、阶段、时间、错误码和 Chat 入口。`/agents/[agentRunId]` 展示 Planner、依赖图、交付物、事件时间线和最终 Assistant Message。增长型详情 Link 均使用 `prefetch={false}`。

删除终态 AgentRun 只删除运行详情、Worker 和 Event；Conversation 与 Message 保留。其他用户的读取、停止、删除与 Worker 操作均返回 404。

## Credits

- USER 默认每天 6 Credits，按 UTC 日期计算；
- Standard 1 Credit，Deep 2 Credits；
- AgentRun 原子创建即计费；ERROR、CANCELLED 与 TIMEOUT 均计费；
- 页面查看、恢复、模式切换和 Planner fallback 不额外计费；
- 单 Worker 取消不退款；
- ADMIN 不被额度阻止，但 UI 仍显示真实使用量。

产品不伪造 token 数、金额、置信度或百分比。

## 隐私与安全

每个 Worker 只获得当前问题、Planner 概览、自己的 assignment、已完成依赖的安全交付、紧凑对话摘要、Persona 安全摘要与最小 Memory 摘要。Worker 中间结果和 AgentEvent 不进入长期 Memory；只有最终 COMPLETE Assistant Message 进入既有 Chat/Memory 流程。

页面、数据库、SSE、恢复接口和日志都不保存或展示 Chain of Thought、reasoning tokens、System/Developer Prompt、Provider 私有元数据或被 OutputGuard 拦截的原始内容。当前能力固定为：

```ts
allowedCapabilities = ["REASONING"]
allowedTools = []
```

本阶段没有联网搜索、引用、文件/PDF/RAG、MCP、邮件/日历/Drive、Shell、代码执行、Git 写入、浏览器自动化、递归 Worker、自动重试或长期自主循环。

## 经典 Brainstorm

`/tools/brainstorm` 继续作为独立的经典四角色头脑风暴。旧 ToolRun、BrainstormWorker、历史、额度、接口和 migration 不迁移到 AgentRun。需要在完整 Chat 中连续追问或使用动态任务/DAG 时，用户可显式切换到 Chat Agent Mode。

## 验证边界

本地单元/契约测试覆盖创建原子性、额度、Planner/DAG/fallback、Worker Pool/Context/Output、Leader、deadline、Tool Policy、取消、恢复、SSE reducer、UI 状态和安全日志。Playwright 定义了 Standard/Deep、fallback、timeout、依赖阻塞、单 Worker/全局取消、模式复位、持久状态对账与移动溢出场景；没有 `PLAYWRIGHT_AUTH_STATE` 时这些登录态场景会明确跳过。真实 Provider、跨用户会话、Preview migration/RLS 与真机后台恢复仍由项目所有者验收，不能用 mock 或 WebKit emulation 替代。
