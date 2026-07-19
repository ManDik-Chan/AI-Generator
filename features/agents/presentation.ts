import type { AgentRunPhaseView, AgentRunStatusView, AgentWorkerStatusView } from "@/features/agents/client-types";

export const agentModeLabels = {
  STANDARD: "标准",
  DEEP: "深度",
} as const;

export const agentRunStatusLabels: Record<AgentRunStatusView, string> = {
  PENDING: "运行中",
  COMPLETE: "已完成",
  ERROR: "失败",
  CANCELLED: "已停止",
};

export const agentRunPhaseLabels: Record<AgentRunPhaseView, string> = {
  PLANNING: "正在规划",
  DISPATCHING: "正在创建 Worker",
  WORKING: "Worker 并行执行中",
  SYNTHESIZING: "正在综合",
  FINISHED: "已完成",
};

export function getAgentRunProgressLabel(run: {
  status: AgentRunStatusView;
  phase: AgentRunPhaseView;
  errorCode: string | null;
  plannedWorkerCount: number;
  successfulWorkerCount: number;
  workers?: Array<{ status: AgentWorkerStatusView }>;
}) {
  if (run.status === "CANCELLED") return "已停止";
  if (run.errorCode === "TIMEOUT") return "超时";
  if (run.status === "ERROR") return run.successfulWorkerCount ? "部分完成" : "失败";
  if (run.status === "COMPLETE" && run.successfulWorkerCount < run.plannedWorkerCount) return "部分完成";
  if (run.phase === "WORKING" && run.workers?.some((worker) => worker.status === "QUEUED") && !run.workers.some((worker) => worker.status === "RUNNING")) {
    return "等待依赖";
  }
  return agentRunPhaseLabels[run.phase];
}
