/*
 * Research Lab fixtures (P1-D2-B). Hand-written local data, clearly labelled on every page.
 *
 * Rules this file follows (unit tests check them):
 * - Claim topics and statuses equal the linked Showcase project's claims, word for word.
 * - No result is written here. REPRODUCIBLE experiments name a harness in replays.ts; their
 *   numbers are computed from repository code when the page renders, and again in the
 *   visitor's browser on request. PLANNED and BLOCKED experiments have no numbers at all.
 * - Open evidence points at files that exist in this repository or pages on this site.
 * - Nothing here reads the Registry or any internal data.
 */
import type { ResearchProject } from "@/features/research/types";

const PROTOCOL_DATE = "2026-10-31";
const TYPESCRIPT = { name: "TypeScript", version: "5.9.3" };
const NODE = { name: "Node.js", version: "22.x" };
const VITEST = { name: "Vitest", version: "4.1.10" };
const BROWSER_RUNTIME = "构建时 Node.js 22；复现时在你的浏览器中运行同一份代码";
const RESEARCH_TEST_COMMAND = "pnpm vitest run features/research";

const routeOptimizer: ResearchProject = {
  slug: "route-optimizer",
  title: "路线优化求解器",
  question: "工程启发式在几十毫秒内能把旅行商路线做到多好？这个“多好”能否被证明，而不只是被估计？",
  summary: "服务端求解器的研究记录：哪些质量结论有可证明的下界支撑，哪些由测试检查，哪些还没有做实验。",
  provenance: "real",
  showcaseSlug: "route-optimizer",
  approach: [
    { title: "方法", body: "最近邻或带种子的随机构造，再用 2-opt、Or-opt 改进到收敛；用 Prim 算法求完全图的最小生成树（MST）权重。" },
    { title: "可以证明的部分", body: "去掉闭合路线上的任意一条边会得到一条生成路径，它不短于 MST，所以 MST ≤ 最优路线 ≤ 求得的路线。路线 / MST − 1 因此是距最优的上界。" },
    { title: "还没有回答的问题", body: "上界不是实际差距。要知道离最优解究竟多远，需要在含已证明最优值的公开基准集上对照，这个实验还没有做。" },
  ],
  claims: [
    {
      id: "two-opt-local-optimum",
      topic: "2-opt 局部最优",
      status: "SOURCE_IMPLEMENTED",
      statement: "2-opt、Or-opt 与模拟退火的结果都经过 2-opt 打磨；返回的路线上没有任何一个 2-opt 交换能再缩短它。",
      evidence: [
        { kind: "source", label: "TourSolver：2-opt 与 Or-opt 改进", ref: "features/demos/route-optimizer/solver.ts", availability: "open" },
        { kind: "test", label: "ends 2-opt, Or-opt and annealing at a 2-opt local optimum", ref: "features/demos/route-optimizer/route-optimizer.test.ts", availability: "open" },
      ],
    },
    {
      id: "mst-lower-bound",
      topic: "可证明的下界",
      status: "SOURCE_IMPLEMENTED",
      statement: "最小生成树权重不大于任何闭合路线，返回的 gap 是距最优解的上界，而不是估计。",
      evidence: [
        { kind: "source", label: "mstWeight：Prim 最小生成树", ref: "features/demos/route-optimizer/geometry.ts", availability: "open" },
        { kind: "test", label: "returns a valid tour from the start city, never below the bound", ref: "features/demos/route-optimizer/route-optimizer.test.ts", availability: "open" },
        { kind: "doc", label: "API Reference · route-optimizer.solve", ref: "/docs/api#route-optimizer-solve", availability: "open" },
      ],
    },
    {
      id: "deadline-cancel",
      topic: "截止时间与取消",
      status: "SOURCE_IMPLEMENTED",
      statement: "求解按 25 ms 时间片推进；到截止时间返回目前最好的结果（TIMED_OUT），客户端断开则停止计算（CANCELLED）。",
      evidence: [
        { kind: "source", label: "executeRun：运行状态机与截止时间", ref: "features/demos/runtime/executor.ts", availability: "open" },
        { kind: "test", label: "returns TIMED_OUT with the best tour so far when the deadline is reached", ref: "features/demos/runtime/runtime.test.ts", availability: "open" },
        { kind: "test", label: "keeps the best tour when interrupted", ref: "features/demos/route-optimizer/route-optimizer.test.ts", availability: "open" },
      ],
    },
    {
      id: "optimality-gap",
      topic: "与最优解的实际差距",
      status: "PLANNED",
      statement: "需要与精确求解器在公开基准集上对照，尚未进行，不发布数值。",
      evidence: [],
    },
  ],
  experiments: [
    {
      id: "ROUTE-01",
      title: "MST 下界与距最优上界",
      objective: "在四种点集上确认求得的路线从不短于 MST 下界，并给出每种点集的“距最优上界”。",
      claimIds: ["mst-lower-bound"],
      status: "REPRODUCIBLE",
      site: "browser",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "按种子生成四种 120 城点集：均匀随机、聚类、环形、网格；坐标保留一位小数。",
        "以城市 0 为起点做最近邻构造，分别用 2-opt 与 Or-opt 改进到收敛，不设截止时间。",
        "用 Prim 算法计算同一点集完全图的最小生成树权重。",
        "计算 Or-opt 路线长度 / MST − 1，记为距最优的上界。",
      ],
      parameters: [
        { name: "城市数", value: "120" },
        { name: "种子", value: "7" },
        { name: "点集", value: "均匀随机 · 聚类 · 环形 · 网格" },
        { name: "构造", value: "最近邻，起点城市 0" },
        { name: "改进", value: "2-opt；Or-opt（均跑到收敛）" },
        { name: "截止时间", value: "无" },
      ],
      environment: {
        runtime: BROWSER_RUNTIME,
        entry: [
          { path: "features/demos/route-optimizer/instances.ts", symbol: "generateInstance" },
          { path: "features/demos/route-optimizer/solver.ts", symbol: "TourSolver" },
          { path: "features/demos/route-optimizer/geometry.ts", symbol: "mstWeight" },
          { path: "features/research/replays.ts", symbol: "runReplay" },
        ],
        dependencies: [TYPESCRIPT, NODE],
        randomness: "mulberry32 伪随机数；点集与求解器各自由种子派生",
      },
      reproducibility: {
        level: "tolerance",
        detail: "路线长度是平方根之和，相同代码与种子给出相同的浮点结果。比对时长度允许 10⁻⁹ 的相对误差，用来吸收不同 JavaScript 引擎在高斯采样（log、cos）上可能出现的末位差异。",
        command: RESEARCH_TEST_COMMAND,
      },
      criterion: "所有路线都不短于 MST 下界；改进不会让路线变长；Or-opt 不比同一构造下的 2-opt 差。",
      replay: "route-bound",
      limitations: [
        "距最优上界只是上界，不是与最优解的实际差距。",
        "只覆盖 120 城与四种合成点集，不代表真实路网。",
        "不测量耗时：耗时取决于设备，不作为结论。",
      ],
      evidence: [
        { kind: "source", label: "routeBound 实验代码", ref: "features/research/replays.ts", availability: "open" },
        { kind: "test", label: "measures closed tours and the MST bound", ref: "features/demos/route-optimizer/route-optimizer.test.ts", availability: "open" },
      ],
    },
    {
      id: "ROUTE-02",
      title: "2-opt 局部最优性检查",
      objective: "对求解器返回的路线枚举全部 2-opt 交换，确认没有任何一个能再缩短路线。",
      claimIds: ["two-opt-local-optimum"],
      status: "REPRODUCIBLE",
      site: "browser",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "按种子生成 150 城均匀随机点集。",
        "分别运行“最近邻 + 2-opt”“随机构造 + 2-opt”“最近邻 + Or-opt”，都跑到收敛。",
        "对每条返回路线枚举全部 n(n − 3) / 2 = 11,025 个 2-opt 交换，计算路线长度的变化 Δ。",
        "统计 Δ < −10⁻⁹ 的交换个数，并记录最小的 Δ。",
      ],
      parameters: [
        { name: "城市数", value: "150" },
        { name: "种子", value: "11" },
        { name: "点集", value: "均匀随机" },
        { name: "组合", value: "最近邻 + 2-opt · 随机构造 + 2-opt · 最近邻 + Or-opt" },
        { name: "改进阈值", value: "Δ < −10⁻⁹（与求解器相同）" },
      ],
      environment: {
        runtime: BROWSER_RUNTIME,
        entry: [
          { path: "features/demos/route-optimizer/solver.ts", symbol: "TourSolver" },
          { path: "features/research/replays.ts", symbol: "scanTwoOpt" },
        ],
        dependencies: [TYPESCRIPT, NODE],
        randomness: "mulberry32 伪随机数；随机构造使用由种子派生的序列",
      },
      reproducibility: {
        level: "tolerance",
        detail: "交换个数是整数，逐个比对；路线长度与最小 Δ 是浮点数，分别允许 10⁻⁹ 的相对误差与 10⁻⁶ 的绝对误差。",
        command: RESEARCH_TEST_COMMAND,
      },
      criterion: "三条路线上都没有能缩短路线的 2-opt 交换。",
      replay: "route-local-optimum",
      limitations: [
        "2-opt 局部最优不等于全局最优；Or-opt 能找到 2-opt 找不到的改进，本实验的第三行可以看到。",
        "只检查 2-opt 邻域，不检查 3-opt 等更大的邻域。",
      ],
      evidence: [
        { kind: "source", label: "scanTwoOpt 枚举检查", ref: "features/research/replays.ts", availability: "open" },
        { kind: "test", label: "ends 2-opt, Or-opt and annealing at a 2-opt local optimum", ref: "features/demos/route-optimizer/route-optimizer.test.ts", availability: "open" },
      ],
    },
    {
      id: "ROUTE-03",
      title: "截止时间与取消",
      objective: "确认运行到截止时间时返回目前最好的路线（TIMED_OUT），客户端断开时停止计算（CANCELLED）。",
      claimIds: ["deadline-cancel"],
      status: "TEST_COVERED",
      site: "ci",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "以极短的截止时间请求一次求解，检查返回 TIMED_OUT，且结果是一条完整的有效路线。",
        "在事件流进行中断开连接，检查运行转为 CANCELLED 并停止计算。",
        "直接中断求解器，检查保留的是中断前最好的路线。",
      ],
      parameters: [
        { name: "测试文件", value: "runtime.test.ts · route-optimizer.test.ts" },
        { name: "执行方式", value: "Vitest，在仓库检出或 CI 中" },
      ],
      environment: {
        runtime: "Vitest · Node.js 22（仓库测试与 CI）",
        entry: [
          { path: "features/demos/runtime/executor.ts", symbol: "executeRun" },
          { path: "features/demos/route-optimizer/solver.ts", symbol: "TourSolver" },
        ],
        dependencies: [VITEST, TYPESCRIPT, NODE],
        randomness: "固定种子",
      },
      reproducibility: {
        level: "tests",
        detail: "在仓库根目录运行下面的命令即可复现；CI 在每个 Pull Request 上运行同一组测试。本页不执行这些测试，也不展示某一次 CI 的结果。测试依赖服务端运行时（请求、事件流与断开连接），不适合在公开页面中运行。",
        command: "pnpm vitest run features/demos/runtime features/demos/route-optimizer",
      },
      criterion: "测试全部通过。",
      limitations: ["测试使用模拟时钟与模拟请求，不覆盖部署环境中的网络与函数超时行为。"],
      evidence: [
        { kind: "test", label: "returns TIMED_OUT with the best tour so far when the deadline is reached", ref: "features/demos/runtime/runtime.test.ts", availability: "open" },
        { kind: "test", label: "cancels the run when the client disconnects", ref: "features/demos/runtime/runtime.test.ts", availability: "open" },
        { kind: "test", label: "keeps the best tour when interrupted", ref: "features/demos/route-optimizer/route-optimizer.test.ts", availability: "open" },
      ],
    },
    {
      id: "ROUTE-04",
      title: "与已证明最优解的实际差距",
      objective: "在含已证明最优值的公开基准实例上，测量求得的路线与最优路线的实际差距。",
      claimIds: ["optimality-gap"],
      status: "PLANNED",
      site: "server",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "选定一组公开的旅行商基准实例，要求每个实例附带已证明的最优路线长度。",
        "以固定种子与参数运行四种改进策略，不设截止时间。",
        "报告每个实例的路线长度 / 最优长度 − 1，并与同一实例的 MST 上界并列。",
      ],
      parameters: [
        { name: "基准集", value: "待定（必须附带已证明的最优值）" },
        { name: "实例规模", value: "待定" },
        { name: "策略", value: "2-opt · Or-opt · 模拟退火" },
      ],
      environment: {
        runtime: "待定：批量运行需要受控的服务端环境",
        entry: [{ path: "features/demos/route-optimizer/solver.ts", symbol: "TourSolver" }],
        dependencies: [TYPESCRIPT],
        randomness: "固定种子（待定）",
      },
      reproducibility: { level: "none", detail: "尚未执行。基准数据需要作为证据资产随版本发布，复现需要服务端运行记录。" },
      pending: {
        reason: "实验尚未执行。外部基准数据需要审核并作为数据类证据资产发布；批量运行与结果比对需要平台的运行记录与复现判定。",
        requires: ["L-2", "L-3", "L-4", "L-8"],
      },
      limitations: ["在实验完成之前，本项目不发布任何“与最优解差距”的数值。"],
      evidence: [],
    },
  ],
};

const neuralNetwork: ResearchProject = {
  slug: "neural-network",
  title: "神经网络训练场",
  question: "一个从零手写、没有任何机器学习库的反向传播实现，能否被逐项检验为正确？",
  summary: "浏览器内训练的研究记录：梯度正确性可以在你的设备上重算核对，协议健壮性由测试检查，与成熟框架的对照还没有做。",
  provenance: "real",
  showcaseSlug: "neural-network",
  approach: [
    { title: "方法", body: "多层感知机的前向、反向传播与 SGD、Momentum、Adam 都用 TypeScript 手写，在 Web Worker 中运行，不依赖任何机器学习库。" },
    { title: "检验思路", body: "解析梯度可以用中心差分逐个参数核对。两者在浮点舍入噪声范围内一致，才能说反向传播的实现是对的。" },
    { title: "还没有回答的问题", body: "与 PyTorch 等成熟框架逐步对照的数值一致性实验尚未进行；训练速度取决于设备，不作为结论。" },
  ],
  claims: [
    {
      id: "backprop",
      topic: "反向传播正确性",
      status: "SOURCE_IMPLEMENTED",
      statement: "解析梯度与数值梯度在 tanh、ReLU、sigmoid 三种激活下逐项一致。",
      evidence: [
        { kind: "source", label: "Mlp：前向、反向传播与优化器", ref: "features/demos/neural-network/mlp.ts", availability: "open" },
        { kind: "test", label: "backpropagation matches numerical gradients", ref: "features/demos/neural-network/neural-network.test.ts", availability: "open" },
      ],
    },
    {
      id: "on-device",
      topic: "训练在本机进行",
      status: "SOURCE_IMPLEMENTED",
      statement: "页面与 Worker 之间只有 postMessage；没有任何把数据集或结果发往服务器的请求。",
      evidence: [
        { kind: "source", label: "nn.worker.ts：Worker 入口", ref: "features/demos/neural-network/nn.worker.ts", availability: "open" },
        { kind: "source", label: "useNeuralTrainer：页面一侧只与 Worker 通信", ref: "features/demos/neural-network/use-neural-trainer.ts", availability: "open" },
        { kind: "doc", label: "开发者手册 · 浏览器运行时", ref: "/docs/guide#浏览器运行时", availability: "open" },
      ],
    },
    {
      id: "protocol",
      topic: "协议健壮性",
      status: "SOURCE_IMPLEMENTED",
      statement: "每条入站消息按 zod 契约校验；取消、重配置、发散与超时都有确定的终态。",
      evidence: [
        { kind: "source", label: "aig.worker/1 消息契约", ref: "features/demos/neural-network/protocol.ts", availability: "open" },
        { kind: "test", label: "trainer (aig.worker/1) 测试组", ref: "features/demos/neural-network/neural-network.test.ts", availability: "open" },
        { kind: "doc", label: "API Reference · aig.worker/1", ref: "/docs/api#浏览器运行时协议", availability: "open" },
      ],
    },
    {
      id: "framework-parity",
      topic: "与成熟框架的数值一致性",
      status: "PLANNED",
      statement: "尚未与 PyTorch 等框架逐步对照，不作结论。",
      evidence: [],
    },
  ],
  experiments: [
    {
      id: "NN-01",
      title: "反向传播梯度检验",
      objective: "对一个小型网络的全部参数，比较反向传播得到的解析梯度与中心差分得到的数值梯度。",
      claimIds: ["backprop"],
      status: "REPRODUCIBLE",
      site: "browser",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "按种子生成 24 个“双月”样本，噪声 0.1。",
        "构建 2-4-3-1 的全连接网络（31 个参数），分别使用 tanh、ReLU、sigmoid 激活，权重由同一种子初始化。",
        "用学习率 1、无权重衰减的一步 SGD 读出整批数据上平均损失的解析梯度。",
        "对每个参数做步长 h = 10⁻⁵ 的中心差分，记录最大绝对误差与最大相对误差（分母取两者绝对值的较大者，下限 10⁻⁴）。",
      ],
      parameters: [
        { name: "数据集", value: "双月 · 24 个样本 · 噪声 0.1" },
        { name: "网络", value: "2-4-3-1 · 31 个参数" },
        { name: "激活函数", value: "tanh · ReLU · sigmoid" },
        { name: "种子", value: "5（数据与初始化）" },
        { name: "差分步长", value: "h = 10⁻⁵" },
        { name: "精度", value: "float64" },
      ],
      environment: {
        runtime: BROWSER_RUNTIME,
        entry: [
          { path: "features/demos/neural-network/mlp.ts", symbol: "Mlp" },
          { path: "features/demos/neural-network/datasets.ts", symbol: "generateDataset" },
          { path: "features/research/replays.ts", symbol: "gradientCheck" },
        ],
        dependencies: [TYPESCRIPT, NODE],
        randomness: "mulberry32 伪随机数；数据集与初始权重各自由种子派生",
      },
      reproducibility: {
        level: "tolerance",
        detail: "误差本身是浮点舍入噪声，不同引擎的 tanh、exp 实现可能在末位不同。比对时相对误差允许 5 × 10⁻⁷ 的差异、绝对误差允许 10⁻⁹，判定结论必须相同。",
        command: RESEARCH_TEST_COMMAND,
      },
      criterion: "每个参数的相对误差都不超过 10⁻⁶。判定标准与首个参考结果在同一次变更中写入。",
      replay: "mlp-gradient-check",
      limitations: [
        "只检验一个小网络与一个数据集；优化器的收敛行为由单元测试另行检查。",
        "ReLU 在 0 处不可导；若某个预激活恰好落在 ±h 之内，中心差分会失真。本实验不剔除这种情况，只如实报告结果。",
      ],
      evidence: [
        { kind: "source", label: "gradientCheck 实验代码", ref: "features/research/replays.ts", availability: "open" },
        { kind: "test", label: "backpropagation matches numerical gradients", ref: "features/demos/neural-network/neural-network.test.ts", availability: "open" },
      ],
    },
    {
      id: "NN-02",
      title: "aig.worker/1 协议状态机",
      objective: "确认畸形消息、取消、重配置、发散与超时都落到确定的终态，且会话在失败后仍可用。",
      claimIds: ["protocol"],
      status: "TEST_COVERED",
      site: "ci",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "发送不符合契约的消息，检查只回复 protocol.error，不产生其他副作用。",
        "驱动一次运行经过 ACCEPTED → RUNNING → SUCCEEDED，检查训练轮数。",
        "运行中取消、重复启动与重配置，检查各自的终态。",
        "构造发散的损失与超时，检查 FAILED / DIVERGED 与超时终态，且会话仍可继续使用。",
      ],
      parameters: [
        { name: "测试文件", value: "neural-network.test.ts" },
        { name: "执行方式", value: "Vitest，在仓库检出或 CI 中" },
      ],
      environment: {
        runtime: "Vitest · Node.js 22（仓库测试与 CI）",
        entry: [
          { path: "features/demos/neural-network/trainer.ts", symbol: "createTrainer" },
          { path: "features/demos/neural-network/protocol.ts", symbol: "inboundMessageSchema" },
        ],
        dependencies: [VITEST, TYPESCRIPT, NODE],
        randomness: "固定种子",
      },
      reproducibility: {
        level: "tests",
        detail: "在仓库根目录运行下面的命令即可复现；CI 在每个 Pull Request 上运行同一组测试。本页不执行这些测试，也不展示某一次 CI 的结果。",
        command: "pnpm vitest run features/demos/neural-network",
      },
      criterion: "测试全部通过。",
      limitations: ["测试直接驱动训练器，不经过真实的 Worker 线程与浏览器调度。"],
      evidence: [
        { kind: "test", label: "answers malformed messages with protocol.error and does nothing else", ref: "features/demos/neural-network/neural-network.test.ts", availability: "open" },
        { kind: "test", label: "reports a non-finite loss as FAILED / DIVERGED and keeps the session usable", ref: "features/demos/neural-network/neural-network.test.ts", availability: "open" },
        { kind: "test", label: "times out a run that exceeds the browser budget", ref: "features/demos/neural-network/neural-network.test.ts", availability: "open" },
      ],
    },
    {
      id: "NN-03",
      title: "与 PyTorch 的逐步数值对照",
      objective: "用相同的初始权重与批次，在 PyTorch 中逐步训练同一网络，比较每一步的损失与参数。",
      claimIds: ["framework-parity"],
      status: "PLANNED",
      site: "server",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "导出本实现的初始权重与批次顺序。",
        "在 PyTorch（float64）中构建同一网络，载入相同权重。",
        "逐步比较损失与参数更新，报告最大差异。",
      ],
      parameters: [
        { name: "框架", value: "PyTorch（版本待定）" },
        { name: "精度", value: "float64" },
        { name: "优化器", value: "SGD · Momentum · Adam" },
      ],
      environment: {
        runtime: "待定：需要受控的 Python 运行环境",
        entry: [{ path: "features/demos/neural-network/mlp.ts", symbol: "Mlp" }],
        dependencies: [{ name: "PyTorch", version: "待定" }],
        randomness: "导出的固定初始权重",
      },
      reproducibility: { level: "none", detail: "尚未执行。复现需要锁定版本的 Python 环境与服务端运行记录。" },
      pending: {
        reason: "实验尚未执行。平台没有受控的 Python 运行环境，导出的权重与对照结果也还不能作为数据类证据资产发布。",
        requires: ["L-2", "L-3", "L-8"],
      },
      limitations: ["在实验完成之前，不对与成熟框架的一致性作任何结论。"],
      evidence: [],
    },
  ],
};

const sortingLab: ResearchProject = {
  slug: "sorting-lab",
  title: "排序算法对照实验",
  question: "教科书上的渐近复杂度，在部分有序、含大量重复值的输入上，究竟意味着多少次比较？",
  summary: "示例项目，但计算是真实的：比较次数由仓库中的排序代码数出，可以在你的浏览器里换种子重算。",
  provenance: "sample",
  showcaseSlug: "sorting-lab",
  approach: [
    { title: "方法", body: "固定种子生成四种分布的数组：随机、近乎有序、逆序、大量重复。三种算法在同一输入的副本上运行，比较器负责计数。" },
    { title: "为什么数比较次数", body: "比较次数只取决于算法与输入，与设备无关，因此可以逐位复现。运行时间受设备与后台负载影响，不能这样复现。" },
    { title: "还没有回答的问题", body: "运行时间对比需要在固定硬件上重复测量，平台还没有这样的运行环境。" },
  ],
  claims: [
    {
      id: "comparison-counts",
      topic: "比较次数统计",
      status: "EXPERIMENT_VERIFIED",
      statement: "每次比较都由实验代码计数，结果在你的浏览器中可复现。",
      evidence: [
        { kind: "source", label: "runSort：带计数的比较器", ref: "features/platform/sorting.ts", availability: "open" },
        { kind: "test", label: "sorts every distribution correctly with every algorithm", ref: "features/platform/platform.test.ts", availability: "open" },
        { kind: "asset", label: "比较次数表（CSV）", availability: "pending", note: "按 Registry 契约，「实验已验证」的声明必须绑定证据资产。示例项目还没有这个资产，平台也还不能分发数据类资产。" },
      ],
    },
    {
      id: "running-time",
      topic: "运行时间对比",
      status: "PLANNED",
      statement: "浏览器计时受设备影响，暂不作为结论发布。",
      evidence: [],
    },
  ],
  experiments: [
    {
      id: "SORT-01",
      title: "比较次数对照（n = 64）",
      objective: "在四种输入分布上，数出插入排序、归并排序与快速排序各做了多少次比较。",
      claimIds: ["comparison-counts"],
      status: "REPRODUCIBLE",
      site: "browser",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "按种子生成四种长度为 64 的输入：随机、近乎有序、逆序、大量重复。",
        "三种算法分别在同一输入的副本上运行，比较器每被调用一次计数加一。",
        "检查每次运行的输出都是输入的升序排列。",
      ],
      parameters: [
        { name: "数组长度", value: "64" },
        { name: "种子", value: "2026" },
        { name: "分布", value: "随机 · 近乎有序 · 逆序 · 大量重复" },
        { name: "算法", value: "插入排序 · 自顶向下归并排序 · 三数取中快速排序" },
      ],
      environment: {
        runtime: BROWSER_RUNTIME,
        entry: [
          { path: "features/platform/sorting.ts", symbol: "runSort" },
          { path: "features/platform/sorting.ts", symbol: "makeInput" },
          { path: "features/research/replays.ts", symbol: "runReplay" },
        ],
        dependencies: [TYPESCRIPT, NODE],
        randomness: "mulberry32 伪随机数，种子决定输入",
      },
      reproducibility: {
        level: "exact",
        detail: "比较次数是整数，只取决于算法与输入，任何引擎上都应逐位一致。与 Showcase 项目页基准表使用同一份代码。",
        command: RESEARCH_TEST_COMMAND,
      },
      criterion: "12 次运行的输出都是输入的升序排列。",
      replay: "sorting-comparisons",
      limitations: ["只统计比较次数，不统计交换与写入。", "n = 64 很小；渐近行为需要更大的 n 才能看清。"],
      evidence: [
        { kind: "source", label: "sortingComparisons 实验代码", ref: "features/research/replays.ts", availability: "open" },
        { kind: "test", label: "is deterministic for a seed and counts plausible comparisons", ref: "features/platform/platform.test.ts", availability: "open" },
      ],
    },
    {
      id: "SORT-02",
      title: "运行时间对比",
      objective: "在固定硬件上重复测量三种算法的运行时间，判断比较次数的差异能否转化为时间差异。",
      claimIds: ["running-time"],
      status: "BLOCKED",
      site: "server",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "在固定规格、无其他负载的机器上预热 JIT。",
        "每种算法与分布重复测量 30 次，报告中位数与四分位距。",
      ],
      parameters: [
        { name: "数组长度", value: "64 · 1,024 · 16,384" },
        { name: "重复次数", value: "30" },
        { name: "硬件", value: "待定（需随结果记录）" },
      ],
      environment: {
        runtime: "待定：需要固定硬件的受控运行环境",
        entry: [{ path: "features/platform/sorting.ts", symbol: "runSort" }],
        dependencies: [TYPESCRIPT],
        randomness: "固定种子",
      },
      reproducibility: { level: "none", detail: "计时结果依赖硬件，只有在记录了硬件规格的受控环境中才有复现意义。" },
      pending: {
        reason: "浏览器计时受设备、后台负载与 JIT 预热影响，噪声大于算法之间的差异；平台没有固定硬件的运行环境，也没有可以记录重复测量的运行记录。",
        requires: ["L-3", "L-4", "L-8", "L-9"],
      },
      limitations: ["在实验完成之前，不发布任何运行时间数值。"],
      evidence: [],
    },
  ],
};

const SAMPLE_NOTE = "示例项目的人物与源码都是虚构的，没有可打开的内容。";

const volumeReconstruction: ResearchProject = {
  slug: "volume-reconstruction",
  title: "体数据三维重建",
  question: "从切片到三维网格的流水线中，每个环节的结论分别有多少证据？哪些需要 GPU 与审核过的数据才能回答？",
  summary: "示例研究项目，用来说明需要服务端或 GPU 的实验在平台上应如何呈现：给出协议与解锁条件，不给数字。",
  provenance: "sample",
  showcaseSlug: "volume-reconstruction",
  approach: [
    { title: "方法", body: "窗宽窗位、阈值分割与连通域去噪得到目标掩膜，再用等值面提取生成三维网格；学习型分割模型作为可选环节。" },
    { title: "数据边界", body: "平台默认不接收真实医学影像。Showcase 实验室中的切片全部由程序生成，不含任何病例。" },
    { title: "还没有回答的问题", body: "分割精度与模型推理都需要审核过的数据集和 GPU 运行环境，平台尚未提供。" },
  ],
  claims: [
    {
      id: "threshold-segmentation",
      topic: "阈值分割与连通域去噪",
      status: "SOURCE_IMPLEMENTED",
      statement: "示例声明：处理流程在示例项目的源码中可定位。",
      evidence: [{ kind: "source", label: "示例源码位置", availability: "sample", note: SAMPLE_NOTE }],
    },
    {
      id: "isosurface",
      topic: "等值面网格生成",
      status: "SOURCE_IMPLEMENTED",
      statement: "示例声明：用 Marching Cubes 生成网格。",
      evidence: [{ kind: "source", label: "示例源码位置", availability: "sample", note: SAMPLE_NOTE }],
    },
    {
      id: "learned-model",
      topic: "学习型分割模型",
      status: "DOCUMENTED",
      statement: "示例声明：只在文档中描述，权重与实验尚未核验。",
      evidence: [{ kind: "doc", label: "示例模型卡", availability: "sample", note: SAMPLE_NOTE }],
    },
    {
      id: "segmentation-accuracy",
      topic: "分割精度",
      status: "PLANNED",
      statement: "没有可复现实验，因此不发布任何精度数值。",
      evidence: [],
    },
  ],
  experiments: [
    {
      id: "VOL-01",
      title: "分割精度（Dice）评测",
      objective: "在审核过的标注数据集上，用 Dice 系数评估分割掩膜与人工标注的重合程度。",
      claimIds: ["segmentation-accuracy"],
      status: "BLOCKED",
      site: "gpu",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "选定经过数据等级审核、已去标识化的标注数据集，并作为证据资产随版本发布。",
        "在固定 GPU 上以固定权重推理，输出掩膜。",
        "逐例计算 Dice 系数，报告分布与失败案例。",
      ],
      parameters: [
        { name: "指标", value: "Dice 系数" },
        { name: "数据集", value: "待定（需审核数据等级）" },
        { name: "硬件", value: "待定（需随结果记录）" },
      ],
      environment: {
        runtime: "待定：需要 GPU 运行环境",
        entry: [],
        dependencies: [],
        randomness: "固定权重与推理配置（待定）",
      },
      reproducibility: { level: "none", detail: "需要数据集、权重与 GPU 运行环境都被记录并可再次获取。" },
      pending: {
        reason: "平台不接收真实医学影像；评测需要审核过数据等级的数据集、GPU 运行环境，以及发起人身份、配额、隔离与审计。",
        requires: ["L-1", "L-2", "L-3", "L-8", "L-9"],
      },
      limitations: ["在实验完成之前，不发布任何精度数值。"],
      evidence: [],
    },
    {
      id: "VOL-02",
      title: "学习型模型的权重核验",
      objective: "核对发布的模型权重与模型卡描述一致，并在合成数据上完成一次推理冒烟测试。",
      claimIds: ["learned-model"],
      status: "BLOCKED",
      site: "gpu",
      protocol: { version: "v1", defined: PROTOCOL_DATE },
      method: [
        "读取权重资产的分发摘要，与模型卡中记录的摘要比对。",
        "在合成体数据上推理一次，确认输出形状与数值范围。",
      ],
      parameters: [
        { name: "输入", value: "合成体数据 64³" },
        { name: "权重", value: "示例项目没有权重" },
      ],
      environment: {
        runtime: "待定：需要 GPU 运行环境",
        entry: [],
        dependencies: [],
        randomness: "无",
      },
      reproducibility: { level: "none", detail: "需要权重作为证据资产发布，并在受控环境中推理。" },
      pending: {
        reason: "示例项目没有模型权重；即便有，权重也需要作为证据资产分发，推理需要 GPU 运行环境与执行治理。",
        requires: ["L-1", "L-8", "L-9"],
      },
      limitations: ["冒烟测试只说明模型能运行，不说明分割质量。"],
      evidence: [],
    },
  ],
};

export const researchProjects: readonly ResearchProject[] = [routeOptimizer, neuralNetwork, sortingLab, volumeReconstruction];
