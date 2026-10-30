# 开发者手册

这份手册带你把一个算法、模型或应用整理成 AI-Generator 能理解的形式：写 Manifest、实现一项能力、在本地测试，并理解它将来如何接入平台。本页同时出现在网站 `/docs/guide` 与仓库 `docs/developer/guide.md`。

> **先说清楚现在能做到哪一步。** 平台的 Registry（项目注册、审核、发布）、第三方能力注册、远程运行（L2）与 BYOK 都还没有部署。今天你可以：按 P0.5 契约写并校验 Manifest；按 `aig.capability/0.1` 实现服务端或浏览器能力并在本地完整测试；调用两个公开 Demo 的接口。你**还不能**把自己的能力注册到线上平台——这一步依赖的后台标注在[接口清单](/docs/status)里。

## 接入机制概览

AI-Generator 把开发者的作品看作**项目（Project）**。一个项目可以只展示，也可以提供可运行的**能力（Capability）**。平台规划了四个接入等级：

| 等级 | 内容 | 现状 |
| --- | --- | --- |
| L0 展示 | 成果页、文档、模型卡、静态资产；不执行外部代码 | Manifest 契约与校验已实现，Registry 未部署 |
| L1 受控嵌入 | 独立 origin 的 iframe 沙箱 + 严格消息协议 | 设计中；浏览器能力协议 `aig.worker/1` 已在 Demo 中实现 |
| L2 远程 API | 平台代理调用开发者的服务：授权、状态、结果都经过平台 | 设计中；运行状态机与 Run 资源已在 Demo 中实现 |
| L3 平台托管运行 | 隔离容器与 GPU 预算 | V1 不实施 |

一项能力由三部分组成：

1. **描述符**（`aig.capability/0.1`）：id、版本、执行位置（`server` / `browser`）、传输方式、输入输出 JSON Schema、资源上限、数据去向。
2. **实现**：服务端能力是一个 `execute(input, ctx)` 函数；浏览器能力是一个处理 `aig.worker/1` 消息的 Worker。
3. **运行**：每次执行都是一个 Run，经过 `PENDING → ACCEPTED → RUNNING → 终态`。

两个公开 Demo 就是这两种能力的参考实现：[路线优化求解器](/demos/route-optimizer)是服务端能力，[神经网络训练场](/demos/neural-network)是浏览器能力。

## 开发环境与前置条件

| 需要 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 22.x（CI 同时验证 24） | `.nvmrc` 为 22 |
| pnpm | 11.7.0 | `corepack enable` 后自动使用 `packageManager` 字段的版本 |
| Git | 任意近期版本 | |
| 数据库、Supabase、模型 Provider | **不需要** | 只在开发 AI Hub 功能时才需要，见 `docs/authentication.md` |

两个 Demo、Manifest 校验器和本手册的全部示例都不读取数据库或任何密钥，克隆后即可运行。

## 获取代码与初始化

```bash
git clone https://github.com/ManDik-Chan/AI-Generator.git
cd AI-Generator
pnpm install
pnpm dev
```

打开 `http://localhost:3000/demos`。不需要 `.env.local` 就能运行 Demo 与文档页；登录相关页面会提示缺少配置，这是预期行为。

仓库中与接入相关的目录：

```text
features/demos/runtime/          能力描述符、运行执行器、HTTP 处理、限流、OpenAPI 生成
features/demos/route-optimizer/  服务端能力：求解器、输入输出契约、页面
features/demos/neural-network/   浏览器能力：数据集、MLP、Worker 协议、页面
features/platform/manifest.ts    P0.5 Manifest 校验器
features/platform/run-lifecycle.ts  运行状态机
app/api/demo/v1/                 公开 Demo API 的路由
examples/                        本手册引用的全部示例（都有测试）
docs/developer/                  本手册、API Reference、Manifest 规范、接口清单、openapi.json
```

## 最小接入示例

目标：用十分钟走完“描述 → 实现 → 测试”。我们写一个统计文本的服务端能力 `text-stats.analyze`。

**第一步：写 Manifest 并校验。** Manifest 描述项目本身（名称、类别、可见性、展示能力与研究声明）：

<!-- example: examples/manifest/manifest.json -->
```json
{
  "schemaVersion": "0.5.0",
  "projectId": "3d6f9a2b-7c41-4e8d-9b2a-5f0e1c7d8a96",
  "slug": "route-optimizer",
  "version": "1.0.0",
  "name": "路线优化求解器",
  "summary": "为一组城市求尽量短的闭合路线，并用最小生成树给出下界。",
  "category": "algorithm",
  "visibility": "PUBLIC",
  "integration": { "mode": "SHOWCASE" },
  "capabilities": ["documentation.read", "presentation.read"],
  "researchClaims": [
    {
      "topic": "2-opt 局部最优",
      "status": "SOURCE_IMPLEMENTED",
      "description": "2-opt、Or-opt 与模拟退火的结果都经过 2-opt 打磨，单元测试逐对检查没有可改进的交换。",
      "evidenceAssetIds": ["8a1c4e2f-6b3d-4f7a-9c5e-0d2b1a3f4e6c"]
    }
  ]
}
```

```bash
pnpm manifest:validate examples/manifest/manifest.json
# ✓ examples/manifest/manifest.json 符合 P0.5 Manifest 契约（0.5.0）
```

`projectId` 将来由平台在创建项目时分配；示例中的 UUID 与证据资产 id 都是占位值，Registry 部署前不对应真实记录。字段规则见 [Manifest 与能力描述符](/docs/manifest)。

**第二步：实现能力。** 用 zod 写输入输出契约，用 `defineServerCapability` 把它们和执行函数连起来：

<!-- example: examples/capabilities/text-stats.ts -->
```ts
// A minimal server capability written against the demo runtime contract.
// It is tested in examples/examples.test.ts; it is not registered on the site,
// because third-party registration needs the Registry, which is not deployed yet.
import { z } from "zod";

import { defineServerCapability } from "@/features/demos/runtime/capability";

const input = z.object({ text: z.string().min(1).max(20_000) }).strict();

const output = z
  .object({
    characters: z.int().min(0),
    words: z.int().min(0),
    sentences: z.int().min(0),
    topWords: z.array(z.object({ word: z.string(), count: z.int().min(1) }).strict()).max(5),
    partial: z.boolean(),
  })
  .strict();

export const textStats = defineServerCapability({
  descriptor: {
    id: "text-stats.analyze",
    project: "text-stats",
    version: "0.1.0",
    title: "文本统计",
    summary: "统计字符、词与句子数量，并列出最常见的词。",
    dataFlow: "platform",
    status: "demo",
    limits: { maxInputBytes: 32 * 1024, defaultDeadlineMs: 1000, maxDeadlineMs: 2000 },
    sourcePath: "examples/capabilities/text-stats.ts",
    docsPath: "/docs/guide#服务端能力",
  },
  input,
  output,
  async execute({ text }, ctx) {
    const counts = new Map<string, number>();
    const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    for (let i = 0; i < words.length; i++) {
      counts.set(words[i], (counts.get(words[i]) ?? 0) + 1);
      if (i % 2000 === 1999) {
        await ctx.checkpoint(); // lets the platform cancel us between chunks
        if (ctx.expired()) return ctx.partial(summary(text, words.length, counts, true));
      }
    }
    return summary(text, words.length, counts, false);
  },
});

function summary(text: string, words: number, counts: Map<string, number>, partial: boolean) {
  return {
    characters: [...text].length,
    words,
    sentences: (text.match(/[.!?。！？]+/g) ?? []).length,
    topWords: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([word, count]) => ({ word, count })),
    partial,
  };
}
```

要点：

- 输入 Schema 用 `.strict()`，未知字段直接拒绝；长度、范围写进 Schema，而不是写在 `execute` 里。
- `execute` 返回的对象会再经过输出 Schema 校验，不合格时运行以 `FAILED / INVALID_OUTPUT` 结束，客户端看不到错误的数据。
- 长循环里定期 `await ctx.checkpoint()`：它让出事件循环（进度事件才能发出去），并在客户端断开时抛出中断，运行以 `CANCELLED` 结束。
- 用 `ctx.expired()` 检查截止时间，到时返回 `ctx.partial(结果)`，运行以 `TIMED_OUT` 结束但仍带有部分结果。

**第三步：在本地跑测试。** `executeRun` 就是线上路由使用的执行器，测试里直接调用它：

```ts
import { executeRun } from "@/features/demos/runtime/executor";
import { textStats } from "@/examples/capabilities/text-stats";

const run = await executeRun(textStats, { text: "To be, or not to be." }, { requestId: crypto.randomUUID(), deadlineMs: 1000 });
// run.status === "SUCCEEDED"，run.output.topWords[0] 是 { word: "be", count: 2 }
```

完整测试见 `examples/examples.test.ts`，用 `pnpm test examples` 运行。

**第四步（尚未开放）：注册到平台。** 将来的流程是：在 Registry 创建项目 → 提交 Manifest 与资产 → 独立审核 → 发布不可变版本 → 为能力登记远程端点（L2）。这些步骤依赖的服务都还没有部署；本仓库内的两个 Demo 是由平台直接注册在 `features/demos/runtime/registry.ts` 中的。

## Manifest 编写与校验

- 只写契约允许的字段（`additionalProperties: false`），`schemaVersion` 必须是 `"0.5.0"`。
- `integration.mode` 在 P0.5 只接受 `SHOWCASE`；可运行能力用能力描述符声明，不写进 Manifest。
- `researchClaims` 必须如实标注：`SOURCE_IMPLEMENTED`（源码中可定位）、`DOCUMENTED`（只有文档）、`EXPERIMENT_VERIFIED`（实验已验证，应附证据资产）、`PLANNED`。
- 校验方式有三种，结果一致：命令行 `pnpm manifest:validate <file>`；网站 [Manifest 页](/docs/manifest) 的在线校验器（只在浏览器内运行，不上传）；代码中 `validateManifest(text)`。
- 机器可读的 JSON Schema 在 `docs/developer/contracts/manifest.schema.json`（P0.5 设计契约的副本，单元测试保证与校验器一致）。

## 服务端能力

服务端能力在平台的函数运行时里执行，适合需要服务端资源、私有实现或统一结果的算法。参考实现：`features/demos/route-optimizer/`。

```text
route-optimizer/
  geometry.ts     距离矩阵、路线长度、最小生成树下界
  instances.ts    带种子的点集生成（浏览器与服务端得到相同的点）
  solver.ts       TourSolver：构造 + 2-opt / Or-opt / 模拟退火，按时间片工作
  schema.ts       输入、输出、进度的 zod 契约（也是 OpenAPI 的来源）
  capability.ts   defineServerCapability：把求解器包装成能力
  components/     页面：画布、参数、运行结果、开发者视图
```

一次 `POST /api/demo/v1/runs` 的执行路径（`features/demos/runtime/handlers.ts`）：

1. **限流**：按客户端在内存中计数（60 秒 20 次、同时 2 个）。
2. **读取请求体**：检查 `Content-Type`，按实际字节限制在 64 KiB，解析 JSON。
3. **找到能力**：信封 `{ capability, input }`；未知能力 404，浏览器能力 422。
4. **校验输入**：能力的 zod Schema（400）与 `validate()` 语义规则（422）。
5. **执行**：`executeRun` 推进状态机，给能力一个 `RunContext`；同时设置“截止时间 + 250 ms”的保护计时器，能力若不理会截止时间，执行器会停止等待并以 `TIMED_OUT` 结束。
6. **返回**：JSON 一次返回终态 Run，或把每次状态转换和进度写成 SSE。

求解器为什么按时间片工作：Node.js 是单线程的，一次长计算会让进度事件和断开检测都等到计算结束。`TourSolver.step(25)` 最多工作 25 ms 就返回，能力在两片之间推送进度、`await ctx.checkpoint()`，并检查截止时间。你的能力如果有长循环，也应该这样拆分。

## 浏览器运行时

浏览器能力在访客自己的设备上执行：零服务端成本，数据不离开浏览器，适合可视化、交互式教学和隐私敏感的本地计算。参考实现：`features/demos/neural-network/`。

```text
neural-network/
  datasets.ts           五种带种子的二分类数据集与特征变换
  mlp.ts                多层感知机：前向、交叉熵、反向传播、SGD / Momentum / Adam
  protocol.ts           aig.worker/1 消息的 zod 契约
  trainer.ts            能力本体：一个只依赖 post / schedule / now 的消息处理器
  nn.worker.ts          Worker 入口，把 trainer 接到 postMessage
  host-state.ts         页面侧的纯函数 reducer
  use-neural-trainer.ts React 绑定：优先 Worker，失败时降级到主线程
```

设计要点：

- **能力本体与运行环境分离**。`createTrainer({ post, schedule, now })` 不知道自己跑在 Worker 还是主线程里。测试用同步队列驱动它，Worker 用 `setTimeout`，降级模式也是同一份代码。
- **每条入站消息都校验**。不合协议的消息只会得到 `protocol.error`，不会改变任何状态。
- **页面拥有 PENDING**。页面先生成 `runId` 并记为 PENDING，再发出 `run.start`；之后的每次转换都由 Worker 报告，页面用同一个状态机过滤非法或重复的转换。
- **节流**。Worker 每 16 ms 让出一次；指标约每 50 ms、决策边界网格与权重约每 150 ms 推送一次，避免消息淹没页面。
- **降级要说出来**。无法启动 Worker 时改在主线程运行，并在界面上明确提示。

从页面驱动任意 `aig.worker/1` 能力：

<!-- example: examples/browser/train-once.ts -->
```ts
// Drive any aig.worker/1 capability from a page: configure a session, start one run,
// resolve with the terminal status and the last metrics. `port` can be a Worker.
import { WORKER_PROTOCOL, type Metrics, type OutboundMessage, type SessionConfig, type TrainInput } from "@/features/demos/neural-network/protocol";

export interface Port {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export function trainOnce(port: Port, config: SessionConfig, input: TrainInput, runId = `run_${Date.now()}`) {
  return new Promise<{ status: string; metrics: Metrics | null; error?: string }>((resolve) => {
    let metrics: Metrics | null = null;
    const listener = ({ data }: { data: unknown }) => {
      const message = data as OutboundMessage;
      if (message.type === "session.ready") {
        port.postMessage({ protocol: WORKER_PROTOCOL, type: "run.start", runId, input });
      } else if (message.type === "run.progress" && message.runId === runId) {
        metrics = message.metrics;
      } else if (message.type === "run.status" && message.runId === runId && ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(message.status)) {
        port.removeEventListener("message", listener);
        resolve({ status: message.status, metrics, error: message.error?.code });
      } else if (message.type === "protocol.error") {
        port.removeEventListener("message", listener);
        resolve({ status: "REJECTED", metrics, error: message.code });
      }
    };
    port.addEventListener("message", listener);
    port.postMessage({ protocol: WORKER_PROTOCOL, type: "session.configure", config });
  });
}

// In a page (bundlers need a relative path inside new URL):
//   const worker = new Worker(new URL("../../features/demos/neural-network/nn.worker.ts", import.meta.url));
//   const result = await trainOnce(worker, config, { epochs: 200, learningRate: 0.03, batchSize: 16, l2: 0, optimizer: "adam" });
```

在 Next.js（webpack）中创建 Worker 时，`new URL(...)` 里必须是相对路径，打包器才能把 Worker 单独打包；别名 `@/` 不能用在这里。

## 与平台的接口对接

| 你想做的事 | 现在怎么做 | 依赖什么才能上线 |
| --- | --- | --- |
| 让项目出现在探索目录 | 写 Manifest 并通过校验 | Registry、审核、发布（P1） |
| 公开一项服务端能力 | 按 `aig.capability/0.1` 实现并本地测试 | 能力注册、L2 远程适配器、Grant |
| 公开一项浏览器能力 | 按 `aig.worker/1` 实现 Worker | L1 独立 origin 与沙箱验收 |
| 调用平台能力 | 调用 `/api/demo/v1`（Demo 专用） | 正式 `/api/v1` 与授权 |
| 使用用户自己的模型凭据 | 不支持 | BYOK / Credential Gateway |

## 本地开发、测试与调试

```bash
pnpm test                 # 全部单元测试（含示例与文档一致性）
pnpm test features/demos  # 只测两个 Demo 与运行时
pnpm typecheck && pnpm lint
pnpm docs:sync            # 重新生成 openapi.json，刷新文档中的示例代码块
pnpm docs:sync --check    # 只检查，不写文件
pnpm build && pnpm start  # 生产模式
pnpm demo:api-smoke http://127.0.0.1:3000   # 用真实 HTTP 跑一遍文档里的请求
```

调试建议：

- 看完整的请求和事件：两个 Demo 页面下方的“开发者视图”显示真实的请求体、事件流、响应和等价的 curl 命令。
- 调试 SSE：`curl -N` 关闭缓冲；每个事件以空行结束。
- 复现结果：点集、数据集、权重初始化和随机构造都带种子；同样的输入与种子得到同样的结果（被截止时间打断的运行除外）。
- 文档里的示例代码块来自 `examples/`，改示例后运行 `pnpm docs:sync`，否则 `features/docs/docs.test.ts` 会失败。

## 典型错误与故障排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `415 UNSUPPORTED_MEDIA_TYPE` | 没有设置 `Content-Type: application/json` | 加上请求头 |
| `400 INVALID_REQUEST`，path 为 `input.points` | 点数不在 3–400，或坐标超出 0–10000 | 按 `issues` 修正 |
| `400`，提示 points 与 instance | 两个都传或都没传 | 二选一 |
| `422 SEMANTIC_REJECTION`，path 为 `capability` | 想在服务端运行浏览器能力 | 浏览器能力用 Worker 运行 |
| `429 RATE_LIMITED` | 60 秒内超过 20 次，或同时超过 2 个运行 | 等 `Retry-After` 秒 |
| 运行是 `TIMED_OUT`，`partial: true` | 截止时间内没有完成 | 加大 `deadlineMs`（≤ 5000）或减少退火迭代 |
| 浏览器跨域调用失败 | Demo 接口不发送 CORS 头 | 改在服务端或命令行调用 |
| 事件流一次性全部到达 | 代理或客户端缓冲 | `curl -N`；自建代理时关闭缓冲 |
| 训练以 `FAILED / DIVERGED` 结束 | 损失或权重变为非有限值 | 降低学习率、增大批大小 |
| 训练页提示“主线程（降级）” | 浏览器无法启动 Worker | 换用现代浏览器；功能仍可用但较慢 |
| `pnpm test` 报 openapi.json 不一致 | 改了 zod 契约但没重新生成 | `pnpm docs:sync` |

## 安全、隐私与密钥管理

- **不要把密钥放进请求、Manifest 或前端代码。** Demo 接口不需要也不接受任何密钥。任何 `NEXT_PUBLIC_*` 变量都会进入浏览器包。
- **输入是不可信的。** 用严格 Schema 校验；限制长度、数量与数值范围；按实际字节限制请求体；不要把输入拼进 HTML、SQL、Shell 或 URL。
- **错误不泄露内部信息。** 返回稳定的错误码与 `requestId`；不返回堆栈、文件路径、输入原文。执行器会把能力抛出的异常统一替换为 `CAPABILITY_ERROR`。
- **声明数据去向。** 描述符的 `dataFlow`：`none`（不离开浏览器）、`platform`（平台处理、不保存）、`developer`（交给项目运营方，将来需要用户单独同意）。
- **给计算设上限。** 截止时间、协作式取消、并发与频率限制缺一不可；Vercel 的 `maxDuration` 是最后一道硬限制。
- **模型凭据（BYOK）尚未开放。** 设计要求：加密保管、只返回脱敏元数据、开发者永远拿不到用户原始密钥、失败时不静默切换到平台密钥。

## 版本发布与后续维护

- 能力 `version` 使用语义化版本：修复为 PATCH，新增可选输入或输出字段为 MINOR，改变语义或删除字段为 MAJOR。
- 契约本身（`aig.capability/0.1`、`aig.worker/1`、Manifest `0.5.0`）独立版本化；未知版本一律拒绝。
- 修改输入输出 Schema 后：更新测试 → `pnpm docs:sync` → 检查 `openapi.json` 的差异 → 在 PR 中说明兼容性。
- 发布后的版本不可覆盖：将来 Registry 中每个版本都是不可变快照，修正只能发布新版本或撤回旧版本。
- 待实现的后台与安全工作见[接口清单](/docs/status)。
