# API Reference

AI-Generator 面向开发者的接口参考。本页同时出现在网站 `/docs/api` 与仓库 `docs/developer/api-reference.md`，两者是同一个文件。机器可读的规范见 [`openapi.json`](/api/demo/v1/openapi.json)（OpenAPI 3.1，由运行时的 zod 契约生成，单元测试保证与代码一致）。

## 接口状态

每个接口都标注下列四种状态之一。**没有标注为“已实现”的接口，调用都会得到 404。**

| 标记 | 含义 | 本页包含 |
| --- | --- | --- |
| `status:demo` | 已实现、公开可调用的 Demo 专用接口。无需登录、无需密钥，有输入校验、资源限制与限流；用于体验与接入参考，不承诺生产级配额。 | `/api/demo/v1/*` |
| `status:implemented` | 已实现的库与协议，在本仓库中可直接使用并有测试覆盖，但没有作为独立服务部署。 | Manifest 校验器、运行状态机、能力描述符、`aig.worker/1` |
| `status:internal` | 已上线的本站前端接口，依赖登录 Cookie，只供本站页面使用，**不对第三方开放**。 | `/api/chat`、`/api/tools/*` 等 |
| `status:design` | 设计契约，尚未部署。路径与字段可能变化。 | Registry、异步运行（202）、Grant、BYOK |

<!-- widget: try-it -->

## 基础约定

- **Base URL**：与网站同源，例如 `https://<部署域名>`；本地开发为 `http://localhost:3000`。
- **版本**：路径带主版本 `v1`。破坏性变更只会出现在新的主版本路径中（见[版本与兼容性](#版本与兼容性)）。
- **格式**：请求体必须是 `application/json`（UTF-8）。响应为 JSON；运行接口可选 `text/event-stream`。
- **认证**：Demo 接口不需要认证，也不读取 Cookie。不要在请求中放入任何密钥或个人数据。
- **缓存**：除 `openapi.json` 外，所有响应（包括错误）都带 `Cache-Control: no-store`。
- **追踪**：每个响应带 `X-Request-Id`（UUID）；报告问题时请附上它。运行接口另带 `X-Run-Id`。
- **跨域**：不发送 CORS 头。浏览器跨域调用会被拦截；请在服务端、命令行或同源页面中调用。

### 限流与资源上限

| 项目 | 上限 | 超出时 |
| --- | --- | --- |
| 运行次数 | 每个客户端每 60 秒 20 次 | `429 RATE_LIMITED`，带 `Retry-After` |
| 并发运行 | 每个客户端 2 个；每个函数实例 8 个 | `429 RATE_LIMITED`，`Retry-After: 2` |
| 请求体 | 64 KiB（按实际收到的字节计算，不只看 `Content-Length`） | `413 PAYLOAD_TOO_LARGE` |
| 单次运行 | `deadlineMs` ≤ 5000；函数最长 15 秒 | 运行以 `TIMED_OUT` 结束 |

成功的运行响应带 `RateLimit-Limit`、`RateLimit-Remaining`、`RateLimit-Reset`。**限流计数保存在单个函数实例的内存中**，多实例时是尽力而为的第一道防线；全局配额需要共享存储，列在[接口清单](/docs/status)的待办中。

## 运行生命周期

一次运行（Run）经过下列状态。服务端与浏览器运行时使用同一个状态机（`features/platform/run-lifecycle.ts`）。

```text
PENDING → ACCEPTED → RUNNING → SUCCEEDED
                             → FAILED
                             → CANCELLED
                             → TIMED_OUT
```

| 状态 | 含义 | 服务端（`/api/demo/v1/runs`） | 浏览器（`aig.worker/1`） |
| --- | --- | --- | --- |
| `PENDING` | 已创建，尚未受理 | 校验通过后创建 | 页面发出 `run.start` 前创建 |
| `ACCEPTED` | 已受理，资源已分配 | 拿到并发名额 | Worker 接受 `run.start` |
| `RUNNING` | 正在执行 | 能力开始计算 | 开始训练 |
| `SUCCEEDED` | 正常完成，`output` 有值 | 计算结束且输出通过契约校验 | 达到目标轮数 |
| `FAILED` | 出错，`error` 说明原因 | 能力抛错或输出不合契约 | 训练发散、状态非法 |
| `CANCELLED` | 被取消 | 客户端断开连接 | 页面发出 `run.cancel` 或改了配置 |
| `TIMED_OUT` | 超过截止时间 | 到达 `deadlineMs`；能力可返回部分结果 | 单次运行超过 60 秒 |

规则：终态不可逆；重复或非法的转换被忽略（幂等）；`transitions` 按时间顺序记录每个到达的状态。

## 数据结构

完整 JSON Schema 见 `openapi.json` 的 `components.schemas`。

### Run

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `object` | `"run"` | 固定值 |
| `id` | string | `run_` + UUID |
| `capability` / `capabilityVersion` | string | 执行的能力及其语义化版本 |
| `status` | RunStatus | 当前状态，见上表 |
| `createdAt` / `startedAt` / `finishedAt` | ISO 8601 / null | 时间戳 |
| `durationMs` | integer / null | 从开始运行到终态的毫秒数 |
| `transitions` | `{ status, at }[]` | 状态历史 |
| `output` | object / null | `SUCCEEDED` 时有值；`TIMED_OUT` 时仅当能力返回了部分结果 |
| `error` | `{ code, message }` / null | 未成功时的原因，`code` 见[错误处理](#错误处理与状态码) |
| `requestId` | UUID | 创建这次运行的请求 |

### CapabilityDescriptor

能力描述符 `aig.capability/0.1` 声明一项可运行的能力。字段规范见 [Manifest 与能力描述符](/docs/manifest#能力描述符)。

### Error

```json
{
  "code": "INVALID_REQUEST",
  "message": "input 不符合该能力的输入契约。",
  "requestId": "6f0c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f",
  "issues": [{ "path": "input.points", "message": "Too big: expected array to have <=400 items" }]
}
```

`code`、`message`、`requestId` 与 P0.5 错误协议一致；`issues` 是 Demo 扩展，只在 400/422 时出现，`path` 指向请求体中的位置。错误不包含堆栈、文件路径、输入原文或任何密钥。

## 端点

### GET /api/demo/v1/capabilities

`status:demo` 列出全部能力描述符：`route-optimizer.solve`（`execution: server`）与 `neural-network.train`（`execution: browser`）。

```bash
curl -s http://localhost:3000/api/demo/v1/capabilities
```

响应 `200`：`{ "object": "list", "data": CapabilityDescriptor[] }`。

### GET /api/demo/v1/capabilities/{capabilityId}

`status:demo` 读取一个能力描述符，包含输入与输出的 JSON Schema。未知 id 返回 `404 NOT_FOUND`。

```bash
curl -s http://localhost:3000/api/demo/v1/capabilities/route-optimizer.solve
```

### POST /api/demo/v1/runs

`status:demo` 执行一个服务端能力。请求体：

```json
{ "capability": "route-optimizer.solve", "input": { "instance": { "kind": "clustered", "count": 120, "seed": 7 }, "improvement": "or-opt" } }
```

处理顺序：限流 → `Content-Type` → 体积 → JSON → 信封 `{ capability, input }` → 能力是否存在 → 是否在服务端执行 → 输入契约 → 语义规则 → 执行。任何一步失败都返回对应的 4xx，**不会产生运行**。

- 默认（`Accept: application/json`）：同步执行，返回 `200` 与终态 Run。只要运行执行过，HTTP 状态就是 200，请检查 `status`。
- `Accept: text/event-stream`：返回事件流，见[事件流（SSE）](#事件流-sse)。

本 Demo 在一次请求内完成运行（≤ 5 秒）。异步的 `202 Accepted` + 轮询契约属于[设计契约](#设计契约-未部署)，尚未部署。

### route-optimizer.solve

`status:demo` 为一组城市求一条尽量短的闭合路线。

**输入**（`additionalProperties: false`）

| 字段 | 类型 | 默认 | 约束 |
| --- | --- | --- | --- |
| `points` | `[x, y][]` | — | 3–400 个点，坐标 0–10000。与 `instance` 二选一 |
| `instance` | `{ kind, count, seed }` | — | 由服务端按种子生成点集：`kind` 为 `uniform` / `clustered` / `circle` / `grid`，`count` 3–400 |
| `construction` | enum | `nearest-neighbor` | `nearest-neighbor` / `random` |
| `improvement` | enum | `two-opt` | `none` / `two-opt` / `or-opt` / `annealing` |
| `annealingIterations` | integer | 200000 | 1000–3000000，仅退火使用 |
| `seed` | integer | 1 | 随机构造与退火的种子 |
| `startIndex` | integer | 0 | 起点城市，必须小于点数，否则 `422` |
| `deadlineMs` | integer | 3000 | 50–5000 |

**输出**

| 字段 | 说明 |
| --- | --- |
| `tour` | 访问顺序（点的下标），从 `startIndex` 开始，最后回到起点 |
| `length` / `initialLength` | 最终长度与构造后的长度 |
| `improvement` | `1 − length / initialLength` |
| `lowerBound` | 最小生成树权重：任何闭合路线都不会短于它 |
| `gap` | `length / lowerBound − 1`，即距最优解的上界 |
| `iterations` / `appliedMoves` / `passes` | 评估的候选移动、采纳的移动、改进轮数 |
| `stopReason` | `construction-only` / `converged` / `schedule-complete` / `deadline` |
| `partial` | 截止时间打断求解时为 `true`（此时运行状态为 `TIMED_OUT`） |
| `elapsedMs`、`convergence` | 服务端计算耗时，最多 120 个 `{ at, length }` 采样 |
| `points` | 仅当输入使用 `instance` 时回传 |

算法：最近邻构造为 O(n²)；2-opt 为首次改进策略，直到没有可缩短的交换；Or-opt 把 1–3 个连续城市以任一方向移到别处，与 2-opt 交替直到都无改进；模拟退火在随机 2-opt 移动上做几何降温，最后用 2-opt 打磨。所有策略的结果都是 2-opt 局部最优（单元测试逐对验证）。

### GET /api/demo/v1/openapi.json

`status:demo` 返回 OpenAPI 3.1 文档，内容与仓库 `docs/developer/openapi.json` 相同。

## 事件流（SSE）

发送 `Accept: text/event-stream` 时，响应是 Server-Sent Events：

```text
event: run.status
data: {"object":"run","id":"run_…","status":"PENDING",…}

event: run.progress
data: {"runId":"run_…","data":{"phase":"two-opt","elapsedMs":12.4,"length":7731.2,"iterations":41210,"tour":[…]}}

event: run.status
data: {"object":"run","id":"run_…","status":"SUCCEEDED","output":{…},…}
```

- `run.status`：每次状态转换发送一次完整 Run；最后一条为终态，之后流结束。
- `run.progress`：能力自定义的进度，最多每 60 ms 一条。`route-optimizer.solve` 推送当前最好路线。
- 客户端断开即取消运行：服务端在下一个检查点（≤ 25 ms）停止计算并释放并发名额。
- 限流与校验错误在流开始之前以普通 JSON 错误返回，HTTP 状态非 200。

## 错误处理与状态码

| HTTP | `code` | 何时出现 | 怎么处理 |
| --- | --- | --- | --- |
| 200 | — | 运行已执行（任何终态） | 检查 `status` 与 `error` |
| 400 | `INVALID_REQUEST` | JSON 无效、信封错误、输入不符合契约 | 按 `issues` 修正后重试 |
| 404 | `NOT_FOUND` | 未知能力 | 先调用能力列表 |
| 405 | — | 方法不支持（如 `GET /runs`） | 使用文档中的方法 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 64 KiB | 改用 `instance` 或减少点数 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` 不是 `application/json` | 设置正确的头 |
| 422 | `SEMANTIC_REJECTION` | 形状正确但无法执行：浏览器能力、`startIndex` 越界 | 按 `issues` 修正，不要原样重试 |
| 429 | `RATE_LIMITED` | 超出频率或并发上限 | 等待 `Retry-After` 秒 |
| 500 | `INTERNAL_ERROR` | 服务端意外错误 | 稍后重试，附上 `requestId` 报告 |

运行级错误码（`Run.error.code`）：`DEADLINE_EXCEEDED`、`CANCELLED`、`CAPABILITY_ERROR`、`INVALID_OUTPUT`、`DIVERGED`、`INVALID_STATE`。

## 认证、授权与安全边界

| 接口类别 | 认证 | 授权 | 数据 |
| --- | --- | --- | --- |
| `status:demo` `/api/demo/v1/*` | 无 | 无；按客户端 IP 在内存中限流 | 输入只用于本次计算，不写数据库、不写日志 |
| `status:internal` 本站接口 | Supabase 登录 Cookie（服务端校验） | 按用户隔离；数据库 RLS | 用户自己的对话、记忆、工具记录 |
| `status:design` Registry 内部命令 | Bearer（Supabase access token） | 每次实时校验内部白名单与项目角色；token 本身不够 | 草稿、审核、发布 |
| `status:design` BYOK / 远程运行 | 待定 | Grant（主体、版本、能力、范围、期限），可撤销 | 凭据加密保管，永不返回明文 |

Demo 接口的安全措施：严格的输入 Schema（未知字段拒绝）、按实际字节计算的体积上限、单次运行截止时间与函数最长时长、协作式取消、频率与并发限流、错误信息脱敏、全部 `no-store`。它不访问数据库、不使用任何 Provider 密钥、不发起外部网络请求。

## 浏览器运行时协议

`status:implemented` `aig.worker/1` 是页面（host）与运行在 Web Worker 中的能力之间的消息协议。每条消息都带 `protocol: "aig.worker/1"`，Worker 用 zod 校验每条入站消息。

| 方向 | `type` | 字段 | 说明 |
| --- | --- | --- | --- |
| 页面 → Worker | `session.configure` | `config` | 生成数据集并初始化网络；会取消进行中的运行 |
| 页面 → Worker | `session.reset` | `seed` | 用新种子重新初始化权重，保留数据 |
| 页面 → Worker | `run.start` | `runId`, `input` | 从当前权重继续训练 `input.epochs` 轮 |
| 页面 → Worker | `run.cancel` | `runId` | 停止运行，保留权重 |
| Worker → 页面 | `session.ready` | `session` | 数据点、网络结构、决策边界网格、初始指标 |
| Worker → 页面 | `run.status` | `runId`, `status`, `at`, `epoch`, `error?` | 每次状态转换 |
| Worker → 页面 | `run.progress` | `runId`, `metrics`, `grid?`, `weights?` | 节流推送：指标约每 50 ms，网格与权重约每 150 ms |
| Worker → 页面 | `protocol.error` | `code`, `message`, `issues?` | 入站消息不合协议，未执行任何操作 |

完整的 zod 定义在 `features/demos/neural-network/protocol.ts`；如何用它驱动一个 Worker，见[开发者手册](/docs/guide#浏览器运行时)。

## 版本与兼容性

- **路径版本**：`/api/demo/v1`。在 `v1` 内只做向后兼容的变更：新增可选字段、新增能力、新增事件类型。删除或改名字段、收紧约束、改变语义需要新的主版本路径，旧版本保留一个公告周期。
- **契约版本**：能力描述符 `aig.capability/0.1`、浏览器协议 `aig.worker/1`、P0.5 Manifest `0.5.0` 各自独立版本化；收到未知版本时必须拒绝，不能静默降级或猜测。
- **能力版本**：`capabilityVersion` 遵循语义化版本。输出新增字段为次版本；改变结果语义（例如换算法导致同一输入结果不同）为主版本。
- **客户端约定**：忽略未知的响应字段与事件类型；不要依赖 `transitions` 的时间间隔或 `elapsedMs` 的具体值。
- **预发布状态**：`status:demo` 接口在本 PR 合并后才会出现在正式站点；其配额可能调整，调整会写入本页与 `openapi.json`。

## 平台内部接口

`status:internal` 以下接口已经上线，但只供本站前端使用：依赖 Supabase 登录 Cookie、没有 CORS、请求格式随页面调整，不作为第三方 API。列出它们是为了说明平台已有的能力边界。

| 路径 | 用途 |
| --- | --- |
| `POST /api/chat`，`/api/chat/messages/{id}/status`、`/cancel` | 流式对话、状态与取消 |
| `POST /api/tools/run`，`/api/tools/runs/{runId}` | 文本工具（总结、改写、翻译）与运行记录 |
| `POST /api/tools/image/run`、`/api/tools/image-generate` | 图片理解与生成 |
| `POST /api/agents`，`/api/agents/{agentRunId}/*` | Agent 编排（Draft，验收中） |
| `/api/personas/*`、`/api/generated-images/*` | 人格与私有图片资产 |

## 设计契约（未部署）

`status:design` 以下接口来自平台规划与 P0.5 契约（`codex/platform-p05-convergence-20261028` 分支 `docs/platform/p05/contracts/p1.openapi.json`），**目前都不存在**，调用会得到 404。

| 方法与路径 | 用途 | 依赖 |
| --- | --- | --- |
| `GET /api/v1/projects` | 公开项目目录（只列当前 PUBLIC 版本，limit ≤ 50） | Registry（P1） |
| `GET /api/v1/projects/{projectId}` | 当前发布版本 | Registry |
| `GET /api/v1/projects/{projectId}/releases/{releaseId}` | 指定发布 | Registry |
| `GET /api/v1/projects/{projectId}/releases/{releaseId}/docs/{documentId}` | 发布中的文档 | Registry + 资产净化 |
| `POST /internal/v1/projects` 等 21 个内部命令 | 草稿、资产、审核、发布、撤回、归档 | Registry + 内部白名单 |
| `POST /api/v1/projects/{projectId}/runs` | 创建异步运行，返回 `202 Accepted` 与 `statusUrl`；需 `Idempotency-Key` | 持久任务存储 + Grant |
| `GET /api/v1/runs/{runId}`、`POST /api/v1/runs/{runId}/cancel` | 轮询与取消 | 同上 |
| `POST /api/v1/installations/{id}/grants`、`DELETE /api/v1/grants/{grantId}` | 能力授权与撤销 | Grant 服务 |
| Credential / BYOK 前缀 | 用户自带模型凭据，只返回脱敏元数据 | KMS、AEAD、出站控制 |

Demo 运行接口刻意采用与上表相同的 Run 资源和状态机，只是在一次请求内同步完成。迁移到正式的 L2 接口时，客户端需要改为：发 `POST …/runs` 拿到 `202` 与 `runId`，再轮询或订阅状态；`output`、`error` 与状态含义不变。

## 可运行的请求示例

下面的命令与脚本都在本地 `next start` 上实际运行过；`pnpm demo:api-smoke [baseUrl]` 会依次执行它们并检查状态码。

```bash
# 能力列表
curl -s http://localhost:3000/api/demo/v1/capabilities

# 同步运行：服务端生成 120 个聚类城市，2-opt + Or-opt
curl -s -X POST http://localhost:3000/api/demo/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{"capability":"route-optimizer.solve","input":{"instance":{"kind":"clustered","count":120,"seed":7},"improvement":"or-opt"}}'

# 事件流：-N 关闭缓冲，逐条看到 run.status 与 run.progress
curl -sN -X POST http://localhost:3000/api/demo/v1/runs \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"capability":"route-optimizer.solve","input":{"instance":{"kind":"uniform","count":200,"seed":3},"improvement":"annealing"}}'

# 截止时间：50 ms 内无法完成 300 万次退火 → TIMED_OUT，返回部分结果
curl -s -X POST http://localhost:3000/api/demo/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{"capability":"route-optimizer.solve","input":{"instance":{"kind":"uniform","count":400},"improvement":"annealing","annealingIterations":3000000,"deadlineMs":50}}'

# 错误：浏览器能力不能在服务端运行 → 422
curl -s -X POST http://localhost:3000/api/demo/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{"capability":"neural-network.train","input":{}}'
```

Node.js（18+，无依赖）同步调用：

<!-- example: examples/demo-api/solve.mjs -->
```js
// Run route-optimizer.solve on the Demo Runtime API and print a summary.
// Usage: node examples/demo-api/solve.mjs [baseUrl]   (default http://localhost:3000)

export async function solve(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl}/api/demo/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      capability: "route-optimizer.solve",
      input: { instance: { kind: "clustered", count: 120, seed: 7 }, improvement: "or-opt", deadlineMs: 2000 },
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    // No run was executed. Every error has a stable code and a requestId.
    throw new Error(`HTTP ${response.status} ${body.code}: ${body.message} (requestId ${body.requestId})`);
  }
  // The run executed: HTTP is 200 whatever the outcome, so check its status.
  if (body.status !== "SUCCEEDED" && body.status !== "TIMED_OUT") {
    throw new Error(`run ${body.id} ended ${body.status}: ${body.error?.message}`);
  }
  return body;
}

if (process.argv[1]?.endsWith("solve.mjs")) {
  const run = await solve(process.argv[2] ?? "http://localhost:3000");
  const { length, lowerBound, gap, stopReason } = run.output;
  console.log(`${run.status} in ${run.durationMs} ms: length ${length}, lower bound ${lowerBound}, gap ≤ ${(gap * 100).toFixed(1)}%, ${stopReason}`);
}
```

Node.js 订阅事件流：

<!-- example: examples/demo-api/stream.mjs -->
```js
// Stream a run as Server-Sent Events: every lifecycle transition plus live progress.
// Usage: node examples/demo-api/stream.mjs [baseUrl]   (default http://localhost:3000)

export async function streamRun(baseUrl, { onStatus = () => {}, onProgress = () => {}, signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${baseUrl}/api/demo/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      capability: "route-optimizer.solve",
      input: { instance: { kind: "uniform", count: 300, seed: 3 }, improvement: "annealing", annealingIterations: 400000 },
    }),
    signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`HTTP ${response.status} ${error.code}: ${error.message}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last = null;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === "run.status") {
        last = payload;
        onStatus(payload);
      } else if (event === "run.progress") {
        onProgress(payload.data);
      }
    }
    if (done) break;
  }
  return last; // the terminal Run
}

if (process.argv[1]?.endsWith("stream.mjs")) {
  const run = await streamRun(process.argv[2] ?? "http://localhost:3000", {
    onStatus: (r) => console.log(`status   ${r.status}`),
    onProgress: (p) => console.log(`progress ${p.phase.padEnd(9)} ${p.elapsedMs} ms  length ${p.length}`),
  });
  console.log(`final    ${run.status}, length ${run.output?.length}`);
}
```
