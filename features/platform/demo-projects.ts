/*
 * The two runnable demos as real projects in Explore. Unlike the samples in fixtures.ts
 * everything here exists: capabilities run, claims point at code and tests in this
 * repository, documents link to the developer docs. Their first release is the pull
 * request that adds them, so it stays IN_REVIEW until the owner merges it.
 */
import { sourceUrl } from "@/features/demos/catalog";
import type { PlatformProject } from "@/features/platform/types";

const shared = {
  owner: "AIG 平台团队",
  visibility: "PUBLIC",
  draftState: "IN_REVIEW",
  version: "1.0.0",
  integration: "SHOWCASE",
  provenance: "real",
  updated: "2026-10-30",
  members: [{ name: "AIG 平台团队", roles: ["OWNER", "EDITOR"] }],
  assets: [],
  runs: [],
  ownedByViewer: false,
} satisfies Partial<PlatformProject>;

export const routeOptimizerProject: PlatformProject = {
  ...shared,
  slug: "route-optimizer",
  name: "路线优化求解器",
  tagline: "服务端真实求解的旅行商问题：四种策略、截止时间、实时进度与可证明的下界。",
  summary: "平台的第一个服务端参考能力。为 3–400 个城市求一条尽量短的闭合路线，通过公开的 Demo API 以 JSON 或事件流返回，并用最小生成树给出“距最优至多多少”的上界。",
  category: "algorithm",
  art: "tide",
  tags: ["TypeScript", "TSP", "SSE", "Vercel Function"],
  capabilities: [
    { id: "route-optimizer.solve", label: "路线求解（服务端）", status: "live", detail: "POST /api/demo/v1/runs · 公开 Demo，无需登录，按客户端限流。", dataFlow: "platform" },
    { id: "documentation.read", label: "接口文档与 OpenAPI", status: "live", detail: "API Reference、能力描述符与 OpenAPI 3.1 规范。", dataFlow: "none" },
  ],
  claims: [
    { topic: "2-opt 局部最优", status: "SOURCE_IMPLEMENTED", description: "2-opt、Or-opt 与模拟退火的结果都经过 2-opt 打磨；单元测试逐对检查没有可缩短的交换。" },
    { topic: "可证明的下界", status: "SOURCE_IMPLEMENTED", description: "最小生成树权重不大于任何闭合路线，返回的 gap 是距最优解的上界，而不是估计。" },
    { topic: "截止时间与取消", status: "SOURCE_IMPLEMENTED", description: "求解按 25 ms 时间片进行；到截止时间返回最好结果（TIMED_OUT），客户端断开则停止计算（CANCELLED）。" },
    { topic: "与最优解的实际差距", status: "PLANNED", description: "需要与精确求解器在公开基准集上对照，尚未进行，不发布数值。" },
  ],
  overview: [
    { title: "它解决什么", body: "给定平面上的一组城市，找一条访问每个城市一次并回到起点的最短路线。精确求解是 NP 难的；这里用工程上常见的构造 + 局部搜索，在几毫秒到几秒内得到质量可量化的解。" },
    { title: "为什么在服务端运行", body: "它是平台“服务端能力”的参考实现：输入经过严格契约校验，在有截止时间与限流的函数里执行，运行状态按 PENDING → ACCEPTED → RUNNING → 终态推进，可以一次返回，也可以用事件流实时推送。" },
    { title: "如何复现", body: "点集按种子生成，浏览器与服务端得到同样的点；同一输入与种子的结果相同（被截止时间打断的除外）。页面下方的开发者视图给出等价的 curl 命令。" },
  ],
  architecture: [
    { name: "接口", items: ["POST /api/demo/v1/runs", "JSON 或 text/event-stream", "64 KiB 体积上限 · 限流"] },
    { name: "执行", items: ["executeRun 状态机", "25 ms 时间片 · 协作式取消", "截止时间 → 部分结果"] },
    { name: "算法", items: ["最近邻 / 随机构造", "2-opt · Or-opt", "模拟退火 + 2-opt 打磨", "Prim 最小生成树下界"] },
    { name: "规划中", items: ["异步运行（202 + 轮询）", "共享存储限流", "Registry 中的能力登记"], planned: true },
  ],
  benchmarks: [
    { name: "距最优上界（gap）", dataset: "每次运行的输入", status: "COMPUTED_LIVE", note: "由服务端在每次运行中计算并返回：length / MST − 1。" },
    { name: "求解耗时", dataset: "—", status: "UNPUBLISHED", note: "取决于点数、策略与函数实例，不作为性能结论发布。" },
  ],
  docs: [
    { title: "API Reference · route-optimizer.solve", kind: "reference", language: "zh-CN", summary: "输入输出字段、错误码、事件流与限流。", href: "/docs/api#route-optimizer-solve" },
    { title: "开发者手册 · 服务端能力", kind: "guide", language: "zh-CN", summary: "执行路径、时间片与如何写一个自己的服务端能力。", href: "/docs/guide#服务端能力" },
    { title: "OpenAPI 3.1 规范", kind: "reference", language: "en", summary: "由运行时 zod 契约生成的机器可读规范。", href: "/api/demo/v1/openapi.json" },
  ],
  releases: [
    { version: "1.0.0", state: "IN_REVIEW", date: "2026-10-30", title: "首个版本 · 等待 Owner 验收", notes: ["四种改进策略与两种构造", "JSON 与 SSE 两种返回方式", "截止时间、取消与限流"] },
  ],
  lab: "route",
  links: [
    { label: "打开 Demo", href: "/demos/route-optimizer" },
    { label: "源码", href: sourceUrl("features/demos/route-optimizer") },
  ],
};

export const neuralNetworkProject: PlatformProject = {
  ...shared,
  slug: "neural-network",
  name: "神经网络训练场",
  tagline: "在浏览器里真实训练的小型神经网络：反向传播、三种优化器、实时决策边界。",
  summary: "平台的第一个浏览器参考能力。数据集在访客设备上生成，多层感知机在 Web Worker 中用反向传播训练，页面通过 aig.worker/1 消息协议接收指标、决策边界与权重；任何训练数据都不上传。",
  category: "ai",
  art: "bloom",
  tags: ["TypeScript", "Backpropagation", "Web Worker", "Canvas"],
  capabilities: [
    { id: "neural-network.train", label: "训练（浏览器内）", status: "live", detail: "在你的设备上运行；无法启动 Worker 时降级到主线程并注明。", dataFlow: "none" },
    { id: "documentation.read", label: "协议与实现说明", status: "live", detail: "aig.worker/1 消息协议、能力描述符与源码结构。", dataFlow: "none" },
  ],
  claims: [
    { topic: "反向传播正确性", status: "SOURCE_IMPLEMENTED", description: "单元测试用数值梯度逐项核对 tanh、ReLU、sigmoid 三种激活下的解析梯度。" },
    { topic: "训练在本机进行", status: "SOURCE_IMPLEMENTED", description: "页面与 Worker 之间只有 postMessage；没有任何把数据集或结果发往服务器的请求。" },
    { topic: "协议健壮性", status: "SOURCE_IMPLEMENTED", description: "每条入站消息按 zod 契约校验；取消、重配置、发散与超时都有确定的终态。" },
    { topic: "与成熟框架的数值一致性", status: "PLANNED", description: "尚未与 PyTorch 等框架逐步对照，不作结论。" },
  ],
  overview: [
    { title: "它做什么", body: "在五种二分类数据集上训练一个最多 4 层、每层最多 8 个神经元的全连接网络，实时显示决策边界、训练与测试损失、准确率和权重。" },
    { title: "为什么在浏览器运行", body: "它是平台“浏览器能力”的参考实现：零服务端成本，数据不离开设备。计算放在 Web Worker 里，页面保持流畅；运行同样遵循 ACCEPTED → RUNNING → 终态。" },
    { title: "能观察到什么", body: "加深网络如何让双螺旋可分；二次特征如何让同心圆变得简单；学习率、批大小与 L2 正则如何影响收敛与过拟合。" },
  ],
  architecture: [
    { name: "页面", items: ["useNeuralTrainer · reducer", "Canvas 决策边界", "SVG 网络图与损失曲线"] },
    { name: "协议", items: ["aig.worker/1", "session.configure · run.start · run.cancel", "zod 校验每条消息"] },
    { name: "Worker", items: ["带种子的数据集", "MLP 前向与反向传播", "SGD · Momentum · Adam · L2"] },
    { name: "规划中", items: ["L1 独立 origin 的 iframe 沙箱", "第三方 Worker 能力注册"], planned: true },
  ],
  benchmarks: [
    { name: "测试集准确率", dataset: "当前会话的数据集与划分", status: "COMPUTED_LIVE", note: "由 Worker 在你的浏览器中计算，随训练实时更新。" },
    { name: "训练速度", dataset: "—", status: "UNPUBLISHED", note: "取决于设备，不作为结论。" },
  ],
  docs: [
    { title: "开发者手册 · 浏览器运行时", kind: "guide", language: "zh-CN", summary: "能力本体与运行环境分离、节流与降级。", href: "/docs/guide#浏览器运行时" },
    { title: "API Reference · aig.worker/1", kind: "reference", language: "zh-CN", summary: "每条消息的方向、字段与语义。", href: "/docs/api#浏览器运行时协议" },
  ],
  releases: [
    { version: "1.0.0", state: "IN_REVIEW", date: "2026-10-30", title: "首个版本 · 等待 Owner 验收", notes: ["五种数据集与两种特征", "三种激活与三种优化器", "Worker 失败时降级到主线程"] },
  ],
  lab: "nn",
  links: [
    { label: "打开 Demo", href: "/demos/neural-network" },
    { label: "源码", href: sourceUrl("features/demos/neural-network") },
  ],
};
