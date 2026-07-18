# Agent Worker orchestration

> Phase 7A1.1 — Draft. 本文描述 reasoning-only Worker 编排。Worker 没有搜索、文件、代码执行、Shell、Git、Browser、MCP 或数据库工具。

## 架构

```text
POST /api/agents
  -> Serializable createPendingAgentRun
  -> registerGenerationTask + waitUntil
  -> Planner (one reserved Provider call)
  -> strict plan validation + DAG validation
  -> trusted server creates 4 or 6 AgentWorker rows
  -> dependency-aware Worker pool
  -> at least two COMPLETE Workers
  -> Leader (one reserved Provider call)
  -> partial + terminal Assistant Message persistence
```

SSE observer、数据库状态与 Provider 生命周期彼此分离。Transport 不能取消业务；显式 durable cancellation 与 hard deadline 才能终止 Provider。

## 固定调用预算

| 模式 | Planner | Worker | Leader | 总上限 | Worker 并发 |
|---|---:|---:|---:|---:|---:|
| STANDARD | 1 | 4 × 1 | 1 | 6 | 4 |
| DEEP | 1 | 6 × 1 | 1 | 8 | 6 |

Provider 调用在数据库中先原子 reserve。Planner、每个 Worker 和 Leader 都只能 reserve 一次；数据库约束再次限制 Run 总数和单 Worker `providerCallCount <= 1`。没有 JSON repair 调用、自动重试、再规划、Leader 返工、递归或多轮辩论。

## Planner 与安全 fallback

Planner 只返回 overview 与 Worker assignment，不回答用户。Zod schema 拒绝额外字段；Worker key 必须唯一且符合安全字符限制；标准/深度必须精确为 4/6 个 Worker。

`validateAgentPlan` 校验：

- self dependency、重复依赖和不存在依赖；
- dependency cycle；
- 模式对应的最大依赖深度；
- name/title/objective/expectedDeliverable/dependsOn 字段上限；
- Planner 不能输出 model、tool、temperature、prompt、workerCount、callCount、concurrency、token 或 timeout。

Planner Provider 失败、JSON 无效、Zod/DAG 失败或 OutputGuard 拒绝时不重试。服务端按模式生成确定性的 4/6 Worker fallback，记录 `PLAN_FALLBACK` 并在 UI 明示。Planner 已 reserve 的一次调用保持为真实用量，fallback 本身不调用 Provider。

## DAG 调度

Worker 初始为 QUEUED。服务端按稳定 position 读取当前状态：

1. 所有依赖 COMPLETE 的 Worker 可进入 RUNNING；
2. 当前 wave 在模式并发上限内执行；
3. Worker 完成后重新读取持久化状态并计算下一 wave；
4. 任一依赖为 BLOCKED/ERROR/CANCELLED/TIMEOUT 时，依赖 Worker 进入 `BLOCKED/DEPENDENCY_FAILED`；
5. 无合法 runnable Worker 时，剩余 QUEUED 进入 `BLOCKED/DEPENDENCY_DEADLOCK`；
6. 所有 Worker 进入终态后才判断是否综合。

单 Worker 失败不会停止独立分支。BLOCKED 是终态，不会重新运行。完成顺序不要求与 position 一致。

## Worker Context Envelope

Context Envelope 只在服务端生成：

```ts
interface WorkerContextEnvelope {
  userProblem: string;
  planOverview: string;
  assignment: {
    key: string;
    title: string;
    objective: string;
    expectedDeliverable: string;
    priority: string;
  };
  dependencyDeliverables: Array<{
    workerKey: string;
    summary: string;
    result: string;
  }>;
  conversationSummary?: string;
  personaSummary?: string;
  memorySummary?: string;
}
```

Context 不包含完整历史、Persona systemPrompt、Memory 原文集合、无关 Worker 输出、其他用户数据、数据库、环境变量、密钥、Storage path、System/Developer Prompt 或 Provider 元数据。所有文本被长度限制、XML 转义并标记为不可信数据。

## Worker Deliverable

Worker 只输出严格 JSON：`workSummary`、`findings`、`assumptions`、`risks`、`recommendations`、`finalDeliverable`。数组最多 8 项，单项与最终正文均有上限，所有增量先经过 rolling OutputGuard。

合法 JSON 标记 `structured=true`。JSON 解析失败不会额外调用模型修复；如果仍有安全文本，服务端将其放入 `finalDeliverable` 并明确 `structured=false`，不会伪造空数组内容。被 Guard 拦截的原始文本不写数据库、SSE、Event、Message、恢复或日志。

## Leader

只有所有 Worker 终态且至少两个 COMPLETE 时，Leader 才能 reserve 一次调用。Leader 获得用户问题、紧凑上下文、Planner overview、成功 Worker 的安全结构化交付，以及失败 Worker 的名称/状态/安全错误码。

Leader 不获得 raw Provider response、被拦截输出、Worker 隐藏推理或内部 Prompt。安全增量经 OutputGuard 后进入 SSE，并按 750 ms 或 1024 字符阈值节流写入 PENDING Assistant Message；终态一次性条件更新为 COMPLETE/ERROR。最终 Assistant Message 是后续 Chat 的唯一 Agent 回答来源。

## 状态机

```text
AgentRun:
PENDING/PLANNING
  -> PENDING/DISPATCHING
  -> PENDING/WORKING
  -> PENDING/SYNTHESIZING
  -> COMPLETE|ERROR|CANCELLED / FINISHED

AgentWorker:
QUEUED -> RUNNING -> COMPLETE|ERROR|CANCELLED|TIMEOUT
QUEUED -> BLOCKED|CANCELLED|TIMEOUT
```

所有终态使用条件更新；迟到结果不能覆盖 COMPLETE、ERROR、CANCELLED、TIMEOUT 或 BLOCKED。Run 终态后不能启动 Worker。显式取消写 CANCELLED；总 deadline 写 ERROR/TIMEOUT。

## SSE、waitUntil 与恢复

事件包括 `run`、`planning_started`、`plan_ready`、`plan_fallback`、`workers_created`、Worker queue/start/terminal、`synthesis_started`、`synthesis_delta`、`done`、`error` 与 `cancelled`。

`SseObserver` enqueue 失败时只 detach。已启动的 Promise 由 `registerGenerationTask` 交给 Vercel `waitUntil`；本地 fallback 使用 Next `after`。owner-scoped status API 返回 Run、Worker、Event 与 Assistant Message 的安全持久化快照。恢复只观察原 runId。

## Cancellation 与 timeout

Run cancel 事务锁定 owner-scoped AgentRun，将活动 Worker、Run 与 Assistant Message 写为 CANCELLED，并保留已完成交付。Worker cancel 只锁定目标 Worker，幂等返回当前终态；Provider 通过每 750 ms 检查持久化状态获得 AbortSignal。

Planner、Worker 和 Leader 共用默认/最大 285000 ms deadline；每个 Provider 还受单请求 timeout。deadline timer 在 finally dispose，并为 Vercel `maxDuration=300` 的终态写入留出约 15 秒。总 deadline 耗尽会把未完成 Worker 写为 TIMEOUT/BLOCKED，并以 ERROR/TIMEOUT 收尾 Run。

## Event、RLS 与审计

AgentEvent 只保存最多 96 条粗粒度事件；sequence 在锁定 Run 后生成，`(agentRunId,sequence)` 唯一。事件不逐 token 记录，也不包含问题、输出、Persona、Memory、Prompt、Credential 或 Chain of Thought。

AgentRun、AgentWorker、AgentEvent 使用 `(id,userId)` 复合所有权关系。RLS 对 authenticated 只开放 select-own；所有 mutation 由 trusted server 执行。其他用户的读取、取消、删除与恢复返回 404。

## Worker Tool Policy

当前固定：

```ts
allowedCapabilities = ["REASONING"]
allowedTools = []
```

默认拒绝由服务端 `assertAgentWorkerCapability` / `assertAgentWorkerTool` 强制执行。Phase 7A1.2 和 Phase 7A2 必须重新审查工具 schema、凭据、网络策略、文件边界、沙箱、配额与审计；当前任务没有实现这些能力。
