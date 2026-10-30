/*
 * Sample Agent runs for the public preview. The shapes reuse the real AgentRunView /
 * AgentWorkerView client types so the real AgentWorkerCard can render them, but every
 * value is written by hand for the demo: no Provider was called to produce them.
 */
import type { AgentEventView, AgentModeView, AgentRunPhaseView, AgentRunStatusView, AgentWorkerView } from "@/features/agents/client-types";

/** Fixed clock so server and client render the same elapsed times. */
export const PREVIEW_NOW = Date.parse("2026-10-29T10:06:00.000Z");

const at = (minute: number, second = 0) => new Date(Date.parse("2026-10-29T10:00:00.000Z") + (minute * 60 + second) * 1000).toISOString();

type WorkerSeed = Pick<AgentWorkerView, "name" | "title" | "objective" | "expectedDeliverable" | "priority" | "status"> &
  Partial<Pick<AgentWorkerView, "dependsOnKeys" | "workSummary" | "findings" | "risks" | "recommendations" | "finalDeliverable" | "errorCode">> & { start?: [number, number]; end?: [number, number] };

function workers(seeds: WorkerSeed[]): AgentWorkerView[] {
  return seeds.map((seed, index) => ({
    key: `w${index + 1}`,
    position: index + 1,
    name: seed.name,
    title: seed.title,
    objective: seed.objective,
    expectedDeliverable: seed.expectedDeliverable,
    priority: seed.priority,
    status: seed.status,
    dependsOnKeys: seed.dependsOnKeys ?? [],
    workSummary: seed.workSummary ?? null,
    findings: seed.findings ?? [],
    assumptions: [],
    risks: seed.risks ?? [],
    recommendations: seed.recommendations ?? [],
    finalDeliverable: seed.finalDeliverable ?? null,
    structured: true,
    errorCode: seed.errorCode ?? null,
    startedAt: seed.start ? at(...seed.start) : null,
    completedAt: seed.end ? at(...seed.end) : null,
    createdAt: at(0, 5),
    updatedAt: at(5),
  }));
}

export interface PreviewAgentRun {
  id: string;
  problem: string;
  mode: AgentModeView;
  status: AgentRunStatusView;
  phase: AgentRunPhaseView;
  project?: string;
  planOverview: string;
  providerCallCount: number;
  started: string;
  workers: AgentWorkerView[];
  events: AgentEventView[];
  answer: string | null;
}

export const modeLabels: Record<AgentModeView, string> = { STANDARD: "标准 · 4 Worker", DEEP: "深度 · 6 Worker" };
export const runStatusLabels: Record<AgentRunStatusView, string> = { PENDING: "运行中", COMPLETE: "已完成", ERROR: "失败", CANCELLED: "已停止" };
export const phaseLabels: Record<AgentRunPhaseView, string> = { PLANNING: "规划", DISPATCHING: "分派", WORKING: "执行", SYNTHESIZING: "综合", FINISHED: "结束" };
export const phaseOrder: AgentRunPhaseView[] = ["PLANNING", "DISPATCHING", "WORKING", "SYNTHESIZING", "FINISHED"];

const event = (sequence: number, type: string, summaryText: string, minute: number, workerKey: string | null = null): AgentEventView => ({ sequence, type, workerKey, summaryText, createdAt: at(minute) });

export const previewAgentRuns: readonly PreviewAgentRun[] = [
  {
    id: "sample-launch-plan",
    problem: "为平台预览整理一份上线前检查清单。",
    mode: "STANDARD",
    status: "COMPLETE",
    phase: "FINISHED",
    project: "ai-generator",
    planOverview: "从功能、隐私、性能与沟通四个角度并行检查，再由协调器合并成一份清单。",
    providerCallCount: 6,
    started: "示例 · 今天 18:00",
    workers: workers([
      { name: "W1", title: "功能完整性", objective: "列出每个页面必须可达的入口。", expectedDeliverable: "页面与入口清单", priority: "HIGH", status: "COMPLETE", start: [0, 20], end: [1, 40], workSummary: "按导航结构逐页检查入口。", findings: ["示例：每个模块都应能从主导航进入"], finalDeliverable: "示例交付物：页面入口清单（演示内容，非真实运行输出）。" },
      { name: "W2", title: "隐私边界", objective: "确认预览页不读取任何用户数据。", expectedDeliverable: "数据边界检查项", priority: "HIGH", status: "COMPLETE", start: [0, 20], end: [2, 5], findings: ["示例：预览页面不调用认证或数据库"], risks: ["示例：避免在示例中出现真实姓名或邮箱"], finalDeliverable: "示例交付物：隐私检查项（演示内容）。" },
      { name: "W3", title: "性能与移动端", objective: "检查移动端布局与首屏体积。", expectedDeliverable: "移动端检查项", priority: "MEDIUM", status: "COMPLETE", start: [0, 21], end: [2, 30], recommendations: ["示例：在 390px 宽度检查底部导航"], finalDeliverable: "示例交付物：移动端检查项（演示内容）。" },
      { name: "W4", title: "对外说明", objective: "说明哪些能力已上线、开发中或规划中。", expectedDeliverable: "状态说明文案", priority: "MEDIUM", status: "COMPLETE", start: [0, 22], end: [1, 58], finalDeliverable: "示例交付物：能力状态说明（演示内容）。" },
    ]),
    events: [
      event(1, "RUN_CREATED", "创建运行并记录 1 Credit", 0),
      event(2, "PLAN_ACCEPTED", "Planner 生成 4 个 Worker，DAG 校验通过", 0),
      event(3, "WORKER_COMPLETED", "W1 完成", 1, "w1"),
      event(4, "WORKER_COMPLETED", "W4 完成", 1, "w4"),
      event(5, "WORKER_COMPLETED", "W2、W3 完成", 2, "w3"),
      event(6, "LEADER_COMPLETED", "协调器合并 4 份交付物", 3),
      event(7, "RUN_COMPLETED", "运行结束", 3),
    ],
    answer: "示例回答：协调器把四份交付物合并成一份上线前清单。此处文字为演示内容，不是真实 Agent 输出。",
  },
  {
    id: "sample-research-split",
    problem: "把一个研究问题拆成可以并行推进的子任务。",
    mode: "DEEP",
    status: "PENDING",
    phase: "WORKING",
    project: "research-notes",
    planOverview: "6 个 Worker：先并行收集背景与方法，再由依赖它们的 Worker 做对比与风险评估。",
    providerCallCount: 4,
    started: "示例 · 今天 18:02",
    workers: workers([
      { name: "W1", title: "背景梳理", objective: "整理问题背景与关键术语。", expectedDeliverable: "背景摘要", priority: "HIGH", status: "COMPLETE", start: [2, 10], end: [3, 30], finalDeliverable: "示例交付物：背景摘要（演示内容）。" },
      { name: "W2", title: "方法盘点", objective: "列出可行的研究方法。", expectedDeliverable: "方法清单", priority: "HIGH", status: "COMPLETE", start: [2, 10], end: [4, 0], finalDeliverable: "示例交付物：方法清单（演示内容）。" },
      { name: "W3", title: "数据来源", objective: "说明需要哪些数据以及获取方式。", expectedDeliverable: "数据来源说明", priority: "MEDIUM", status: "RUNNING", start: [2, 12] },
      { name: "W4", title: "反方质疑", objective: "指出最可能失败的假设。", expectedDeliverable: "风险列表", priority: "MEDIUM", status: "RUNNING", start: [2, 12] },
      { name: "W5", title: "方法对比", objective: "基于 W1、W2 对比方法优劣。", expectedDeliverable: "对比表", priority: "MEDIUM", status: "QUEUED", dependsOnKeys: ["w1", "w2"] },
      { name: "W6", title: "落地路径", objective: "基于 W3、W4 给出推进顺序。", expectedDeliverable: "推进计划", priority: "LOW", status: "BLOCKED", dependsOnKeys: ["w3", "w4"] },
    ]),
    events: [
      event(1, "RUN_CREATED", "创建运行并记录 2 Credits", 2),
      event(2, "PLAN_ACCEPTED", "Planner 生成 6 个 Worker 与依赖关系", 2),
      event(3, "WORKER_COMPLETED", "W1 完成", 3, "w1"),
      event(4, "WORKER_COMPLETED", "W2 完成", 4, "w2"),
    ],
    answer: null,
  },
  {
    id: "sample-stopped",
    problem: "比较三种方案的成本并给出建议。",
    mode: "STANDARD",
    status: "CANCELLED",
    phase: "FINISHED",
    planOverview: "4 个 Worker 各自评估一种成本维度；用户在中途停止了运行。",
    providerCallCount: 3,
    started: "示例 · 昨天",
    workers: workers([
      { name: "W1", title: "直接成本", objective: "估算直接成本。", expectedDeliverable: "成本估算", priority: "HIGH", status: "COMPLETE", start: [0, 20], end: [1, 10], finalDeliverable: "示例交付物（演示内容）。" },
      { name: "W2", title: "维护成本", objective: "估算长期维护成本。", expectedDeliverable: "维护估算", priority: "MEDIUM", status: "COMPLETE", start: [0, 20], end: [1, 30], finalDeliverable: "示例交付物（演示内容）。" },
      { name: "W3", title: "迁移成本", objective: "评估迁移风险与工作量。", expectedDeliverable: "迁移评估", priority: "MEDIUM", status: "CANCELLED", start: [0, 21], end: [1, 45] },
      { name: "W4", title: "机会成本", objective: "说明不做的代价。", expectedDeliverable: "机会成本说明", priority: "LOW", status: "CANCELLED", start: [0, 21], end: [1, 45] },
    ]),
    events: [
      event(1, "RUN_CREATED", "创建运行", 0),
      event(2, "PLAN_ACCEPTED", "Planner 生成 4 个 Worker", 0),
      event(3, "RUN_CANCELLED", "用户停止全部；已完成的 W1、W2 保留", 1),
    ],
    answer: null,
  },
];

export function getPreviewAgentRun(id: string) {
  return previewAgentRuns.find((run) => run.id === id);
}

/** Documented limits of the real Chat Agent mode (docs/agent-mode.md, Phase 7A1.1 draft). */
export const agentModes = [
  { key: "CHAT", title: "常规", detail: "继续使用现有对话接口，不创建 Agent 运行。", cost: "不消耗 Agent Credit" },
  { key: "STANDARD", title: "Agent 标准", detail: "1 Planner + 4 个动态 Worker + 最多 1 个协调器，最多 6 次模型调用。", cost: "1 Credit" },
  { key: "DEEP", title: "Agent 深度", detail: "1 Planner + 6 个动态 Worker + 最多 1 个协调器，最多 8 次模型调用。", cost: "2 Credits" },
] as const;
