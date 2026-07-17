import type { BrainstormWorkerRole } from "@prisma/client";

export const BRAINSTORM_PROMPT_MAX_CHARS = 8_000;
export const BRAINSTORM_WORKER_VERSION = "phase-7a1-v1";

export const BRAINSTORM_WORKERS = [
  { role: "ANALYST", position: 0, label: "分析研究员", shortLabel: "分析", purpose: "拆解问题，区分事实、假设、限制与关键变量。" },
  { role: "CREATIVE", position: 1, label: "创意探索者", shortLabel: "创意", purpose: "提出替代方向、非显而易见的思路与可比较方案。" },
  { role: "CRITIC", position: 2, label: "批判审查员", shortLabel: "审查", purpose: "寻找漏洞、风险、反例、遗漏条件与失败原因。" },
  { role: "PLANNER", position: 3, label: "落地规划师", shortLabel: "规划", purpose: "转化为实际步骤、优先级、资源与现在可执行的建议。" },
] as const satisfies ReadonlyArray<{ role: BrainstormWorkerRole; position: number; label: string; shortLabel: string; purpose: string }>;

export const BRAINSTORM_ROLE_LABELS = Object.fromEntries(BRAINSTORM_WORKERS.map((worker) => [worker.role, worker.label])) as Record<BrainstormWorkerRole, string>;
